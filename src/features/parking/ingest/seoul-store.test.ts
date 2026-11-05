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
  it('다음 날짜의 조회 실패·빈 스냅샷은 기존 DB를 훼손하지 않고 재시도 가능하다', async () => {
    const db = openParkingDatabase(':memory:')
    try {
      let now = new Date('2026-10-02T14:59:00Z')
      const load = vi
        .fn()
        .mockResolvedValueOnce(snapshot)
        .mockRejectedValueOnce(new Error('조회 실패'))
        .mockResolvedValueOnce({
          ...snapshot,
          snapshot: { facilities: [], operations: [] },
        })
        .mockResolvedValue(snapshot)
      const store = new SeoulParkingStore(db, load, () => now)
      await store.search(query)
      now = new Date('2026-10-02T15:00:00Z')
      await expect(store.search(query)).rejects.toThrow('조회 실패')
      expect(db.count()).toBe(1)
      expect(db.lastUpdatedDay()).toBe('2026-10-02')
      await expect(store.search(query)).rejects.toThrow('없는 스냅샷')
      await store.search(query)
      expect(db.lastUpdatedDay()).toBe('2026-10-03')
    } finally {
      db.close()
    }
  })
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
