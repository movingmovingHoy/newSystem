// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { openParkingDatabase } from './sqlite.mjs'
import { SeoulParkingStore } from './seoul-store'
import type { SeoulParkingSnapshot } from '../providers/seoul'

const snapshot: SeoulParkingSnapshot = {
  snapshot: {
    facilities: [
      {
        id: 'seoul:1',
        name: '공영주차장',
        region: '서울특별시',
        location: { lat: 37.5665, lng: 126.978 },
      },
    ],
    operations: [{ id: 'seoul:1', fee: null }],
  },
  sourceRows: 1,
  skippedRows: 0,
  duplicateRows: 0,
}
const query = { center: { lat: 37.5665, lng: 126.978 }, radiusM: 1000 }

describe('서울시 주차장 일 단위 저장 및 검색', () => {
  it('동시 요청을 합치고 같은 KST 날짜에는 다시 다운로드하지 않는다', async () => {
    const db = openParkingDatabase(':memory:')
    try {
      const load = vi.fn().mockResolvedValue(snapshot)
      const store = new SeoulParkingStore(
        db,
        load,
        () => new Date('2026-10-02T01:00:00Z'),
      )
      const [a, b] = await Promise.all([
        store.search(query),
        store.search(query),
      ])
      expect(a).toEqual(b)
      expect(a[0].id).toBe('seoul:1')
      expect(a[0].fee).toBeNull()
      await store.search(query)
      expect(load).toHaveBeenCalledTimes(1)
      expect(await store.getAvailability('seoul:1')).toEqual({
        status: 'unknown',
      })
    } finally {
      db.close()
    }
  })
  it('DB가 비어 있는 첫 수집은 끝날 때까지 기다리고 실패하면 오류를 반환한다', async () => {
    const db = openParkingDatabase(':memory:')
    try {
      const load = vi
        .fn()
        .mockRejectedValueOnce(new Error('조회 실패'))
        .mockResolvedValue(snapshot)
      const store = new SeoulParkingStore(
        db,
        load,
        () => new Date('2026-10-02T01:00:00Z'),
      )
      // 보여줄 오래된 데이터조차 없으므로 실패를 숨기지 않는다
      await expect(store.search(query)).rejects.toThrow('조회 실패')
      expect(db.count()).toBe(0)
      // 다음 요청에서 다시 시도해 채운다
      expect((await store.search(query))[0].id).toBe('seoul:1')
    } finally {
      db.close()
    }
  })
})

describe('날짜가 바뀐 뒤: 오래된 DB로 먼저 응답하고 뒤에서 갱신', () => {
  const newer: SeoulParkingSnapshot = {
    ...snapshot,
    snapshot: {
      facilities: [
        {
          id: 'seoul:2',
          name: '새 주차장',
          region: '서울특별시',
          location: { lat: 37.5665, lng: 126.978 },
        },
      ],
      operations: [{ id: 'seoul:2', fee: null }],
    },
  }
  const warn = () => vi.spyOn(console, 'warn').mockImplementation(() => {})
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('갱신이 끝나기를 기다리지 않고 어제 데이터로 바로 응답한다', async () => {
    const db = openParkingDatabase(':memory:')
    const spy = warn()
    try {
      let now = new Date('2026-10-02T01:00:00Z')
      let finish!: (value: SeoulParkingSnapshot) => void
      const load = vi
        .fn()
        .mockResolvedValueOnce(snapshot)
        .mockImplementationOnce(
          () => new Promise<SeoulParkingSnapshot>((r) => (finish = r)),
        )
      const store = new SeoulParkingStore(db, load, () => now)
      await store.search(query) // 첫날: 채움
      now = new Date('2026-10-03T01:00:00Z') // 다음 날
      // 새 수집이 끝나지 않았어도 즉시 어제 데이터로 응답한다
      const lots = await store.search(query)
      expect(lots[0].id).toBe('seoul:1')
      expect(load).toHaveBeenCalledTimes(2)
      expect(db.lastUpdatedDay()).toBe('2026-10-02') // 아직 어제 데이터
      // 갱신이 끝나면 새 데이터로 바뀐다
      finish(newer)
      await flush()
      expect(db.lastUpdatedDay()).toBe('2026-10-03')
      expect((await store.search(query))[0].id).toBe('seoul:2')
    } finally {
      spy.mockRestore()
      db.close()
    }
  })

  it('여러 요청이 와도 뒤에서 하는 갱신은 한 번만 시작한다', async () => {
    const db = openParkingDatabase(':memory:')
    const spy = warn()
    try {
      let now = new Date('2026-10-02T01:00:00Z')
      const load = vi
        .fn()
        .mockResolvedValueOnce(snapshot)
        .mockImplementation(() => new Promise<SeoulParkingSnapshot>(() => {}))
      const store = new SeoulParkingStore(db, load, () => now)
      await store.search(query)
      now = new Date('2026-10-03T01:00:00Z')
      await Promise.all([
        store.search(query),
        store.search(query),
        store.search(query),
      ])
      expect(load).toHaveBeenCalledTimes(2) // 첫날 1번 + 다음 날 1번
    } finally {
      spy.mockRestore()
      db.close()
    }
  })

  it('갱신이 실패해도 오류 없이 어제 데이터를 쓰고 로그를 남긴다', async () => {
    const db = openParkingDatabase(':memory:')
    const spy = warn()
    try {
      let now = new Date('2026-10-02T01:00:00Z')
      const load = vi
        .fn()
        .mockResolvedValueOnce(snapshot)
        .mockRejectedValueOnce(new Error('조회 실패'))
      const store = new SeoulParkingStore(db, load, () => now)
      await store.search(query)
      now = new Date('2026-10-03T01:00:00Z')
      const lots = await store.search(query)
      expect(lots[0].id).toBe('seoul:1') // 오류 대신 어제 데이터
      await flush()
      expect(db.count()).toBe(1) // 기존 DB 훼손 없음
      expect(db.lastUpdatedDay()).toBe('2026-10-02')
      const logged = spy.mock.calls.flat().join(' ')
      expect(logged).toContain('2026-10-02') // 어느 날짜 데이터인지 남긴다
      expect(logged).toContain('조회 실패')
    } finally {
      spy.mockRestore()
      db.close()
    }
  })

  it('실패 직후에는 쉬었다가 재시도해서 클릭마다 API를 부르지 않는다', async () => {
    const db = openParkingDatabase(':memory:')
    const spy = warn()
    try {
      let now = new Date('2026-10-02T01:00:00Z')
      const load = vi
        .fn()
        .mockResolvedValueOnce(snapshot)
        .mockRejectedValueOnce(new Error('조회 실패'))
        .mockResolvedValue(newer)
      const store = new SeoulParkingStore(db, load, () => now)
      await store.search(query)
      now = new Date('2026-10-03T01:00:00Z')
      await store.search(query) // 갱신 시작 → 실패
      await flush()
      expect(load).toHaveBeenCalledTimes(2)
      // 쉬는 시간 안에는 여러 번 눌러도 다시 부르지 않는다
      now = new Date('2026-10-03T01:05:00Z')
      await store.search(query)
      await store.search(query)
      await flush()
      expect(load).toHaveBeenCalledTimes(2)
      // 쉬는 시간(10분)이 지나면 다시 시도한다
      now = new Date('2026-10-03T01:11:00Z')
      await store.search(query)
      await flush()
      expect(load).toHaveBeenCalledTimes(3)
      expect(db.lastUpdatedDay()).toBe('2026-10-03')
    } finally {
      spy.mockRestore()
      db.close()
    }
  })

  it('명시적으로 refresh() 를 부르면 기다렸다가 실패를 그대로 알린다', async () => {
    const db = openParkingDatabase(':memory:')
    try {
      const load = vi.fn().mockRejectedValue(new Error('조회 실패'))
      const store = new SeoulParkingStore(
        db,
        load,
        () => new Date('2026-10-02T01:00:00Z'),
      )
      await expect(store.refresh()).rejects.toThrow('조회 실패')
    } finally {
      db.close()
    }
  })
})

describe('서울시 주차장 일 단위 저장 및 검색 (검색 요청 검증)', () => {
  it('잘못된 검색 요청은 다운로드 전에 거절한다', async () => {
    const db = openParkingDatabase(':memory:')
    try {
      const load = vi.fn()
      const store = new SeoulParkingStore(db, load)
      await expect(store.search({ ...query, radiusM: -1 })).rejects.toThrow()
      expect(load).not.toHaveBeenCalled()
    } finally {
      db.close()
    }
  })
})
