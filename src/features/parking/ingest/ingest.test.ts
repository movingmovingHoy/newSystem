// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { openParkingDatabase } from './sqlite.mjs'
import { ingestParkingSnapshot, normalizeParkingSnapshot } from './snapshot'
import type { ParkingSnapshot } from './snapshot'
import { SqliteParkingProvider } from '../providers/sqlite'

const snapshot: ParkingSnapshot = {
  facilities: [
    {
      id: 'a',
      name: '샘플 A',
      region: '서울특별시',
      location: { lat: 37.5, lng: 127 },
    },
    {
      id: 'b',
      name: '샘플 B',
      region: '서울특별시',
      location: { lat: 37.501, lng: 127 },
    },
    {
      id: 'outside',
      name: '타지역',
      region: '부산광역시',
      location: { lat: 35.1, lng: 129 },
    },
  ],
  operations: [
    {
      id: 'a',
      fee: { baseFee: 0, baseTimeMin: 30, addFee: 0, addTimeMin: 10 },
    },
  ],
}

describe('주차장 샘플 적재', () => {
  it('서울 시설만 관리번호로 요금을 연결하며 미상과 무료를 구분한다', () => {
    const result = normalizeParkingSnapshot(snapshot)
    expect(result.map((l) => l.id)).toEqual(['a', 'b'])
    expect(result[0].fee?.baseFee).toBe(0)
    expect(result[1].fee).toBeNull()
  })
  it('잘못된 요금은 시설을 버리지 않고 정보 없음으로 처리한다', () => {
    const invalid = structuredClone(snapshot)
    invalid.operations[0].fee!.addTimeMin = 0
    expect(normalizeParkingSnapshot(invalid)[0].fee).toBeNull()
  })
  it('동일 관리번호 시설 중복은 명시적으로 거절한다', () => {
    expect(() =>
      normalizeParkingSnapshot({
        ...snapshot,
        facilities: [...snapshot.facilities, snapshot.facilities[0]],
      }),
    ).toThrow()
  })
  it('잘못된 좌표를 거절한다', () => {
    const invalid = structuredClone(snapshot)
    invalid.facilities[0].location.lat = NaN
    expect(() => normalizeParkingSnapshot(invalid)).toThrow()
  })
  it('SQLite에 적재하고 같은 KST 날짜에는 다시 적재하지 않는다', () => {
    const db = openParkingDatabase(':memory:')
    try {
      expect(
        ingestParkingSnapshot(db, snapshot, new Date('2026-09-27T01:00:00Z')),
      ).toEqual({ updated: true, count: 2 })
      expect(
        ingestParkingSnapshot(db, snapshot, new Date('2026-09-27T14:59:00Z')),
      ).toEqual({ updated: false, count: 2 })
      expect(
        ingestParkingSnapshot(db, snapshot, new Date('2026-09-27T15:00:00Z'))
          .updated,
      ).toBe(true)
    } finally {
      db.close()
    }
  })
  it('다음 날은 새 스냅샷으로 교체하며 사라진 주차장은 제거한다', async () => {
    const db = openParkingDatabase(':memory:')
    try {
      ingestParkingSnapshot(db, snapshot, new Date('2026-09-27'))
      ingestParkingSnapshot(
        db,
        { ...snapshot, facilities: [snapshot.facilities[1]] },
        new Date('2026-09-28'),
      )
      const result = await new SqliteParkingProvider(db).search({
        center: { lat: 37.5, lng: 127 },
        radiusM: 1000,
      })
      expect(result.map((l) => l.id)).toEqual(['b'])
    } finally {
      db.close()
    }
  })
  it('잘못되거나 빈 스냅샷은 기존 데이터를 지우지 않는다', async () => {
    const db = openParkingDatabase(':memory:')
    try {
      ingestParkingSnapshot(db, snapshot, new Date('2026-09-27'))
      expect(() =>
        ingestParkingSnapshot(
          db,
          { facilities: [], operations: [] },
          new Date('2026-09-28'),
        ),
      ).toThrow()
      expect(
        (
          await new SqliteParkingProvider(db).search({
            center: { lat: 37.5, lng: 127 },
            radiusM: 1000,
          })
        ).length,
      ).toBe(2)
    } finally {
      db.close()
    }
  })
})

describe('SQLite 원자적 교체', () => {
  it('삽입 중 실패하면 데이터와 갱신 날짜를 함께 롤백한다', () => {
    const db = openParkingDatabase(':memory:')
    try {
      ingestParkingSnapshot(db, snapshot, new Date('2026-09-27'))
      const oldDay = db.lastUpdatedDay()
      const rows = normalizeParkingSnapshot(snapshot)
      expect(() => db.replace([rows[0], rows[0]], '2026-09-28')).toThrow()
      expect(db.count()).toBe(2)
      expect(db.lastUpdatedDay()).toBe(oldDay)
    } finally {
      db.close()
    }
  })
})
