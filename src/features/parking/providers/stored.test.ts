// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { openParkingDatabase } from '../ingest/sqlite.mjs'
import { ingestParkingSnapshot } from '../ingest/snapshot'
import { parkingSampleSnapshot } from '../ingest/samples'
import { SampleParkingProvider } from './sample'
import { SqliteParkingProvider } from './sqlite'
import { findParkingCandidates } from '../finder'
import { distanceM } from './geo'

const center = { lat: 37.5665, lng: 126.978 }

describe('저장된 주차장 검색', () => {
  it('샘플 provider와 SQLite provider가 같은 반경 검색 결과를 반환한다', async () => {
    const db = openParkingDatabase(':memory:')
    try {
      ingestParkingSnapshot(db, parkingSampleSnapshot)
      const query = { center, radiusM: 1000 }
      const sql = await new SqliteParkingProvider(db).search(query)
      expect(sql).toEqual(await new SampleParkingProvider().search(query))
      expect(sql.length).toBeGreaterThanOrEqual(3)
      expect(sql.every((l) => l.distanceToWaypointM <= 1000)).toBe(true)
      expect(sql.some((l) => l.fee === null)).toBe(true)
    } finally {
      db.close()
    }
  })
  it('샘플 지역 밖은 가짜 주차장을 생성하지 않고 빈 배열을 반환한다', async () => {
    expect(
      await new SampleParkingProvider().search({
        center: { lat: 35, lng: 129 },
        radiusM: 1000,
      }),
    ).toEqual([])
  })
  it('좌표가 같은 곳은 반경 0에도 포함한다', async () => {
    const all = await new SampleParkingProvider().search({
      center,
      radiusM: 1000,
    })
    const match = await new SampleParkingProvider().search({
      center: all[0].location,
      radiusM: 0,
    })
    expect(match[0].distanceToWaypointM).toBe(0)
  })
  it('후보 선정 함수와 연결된다', async () => {
    const result = await findParkingCandidates(
      new SampleParkingProvider(),
      center,
      60,
    )
    expect(result).toHaveLength(3)
    expect(new Set(result.map((l) => l.id)).size).toBe(3)
    expect(result.some((l) => l.fee === null)).toBe(true)
  })
  it('반환한 값을 바꿔도 다음 검색에 영향을 주지 않는다', async () => {
    const provider = new SampleParkingProvider()
    const result = await provider.search({ center, radiusM: 1000 })
    result[0].name = '변경됨'
    expect((await provider.search({ center, radiusM: 1000 }))[0].name).not.toBe(
      '변경됨',
    )
  })
  it('잔여석은 항상 정보 없음이다', async () => {
    expect(await new SampleParkingProvider().getAvailability('any')).toEqual({
      status: 'unknown',
    })
  })
  it.each([-1, NaN, Infinity])('잘못된 반경 %s를 거절한다', async (radiusM) => {
    await expect(
      new SampleParkingProvider().search({ center, radiusM }),
    ).rejects.toThrow(RangeError)
  })
})

describe('거리와 DB 경계 검증', () => {
  it('위도 0.001도 차이를 약 111.2m로 계산한다', () => {
    expect(
      distanceM(center, { ...center, lat: center.lat + 0.001 }),
    ).toBeCloseTo(111.195, 2)
  })
  it('좌표 사각형 안이지만 원형 반경 밖인 곳은 제외한다', async () => {
    const db = openParkingDatabase(':memory:')
    try {
      db.replace(
        [
          {
            id: 'corner',
            name: '모서리',
            location: { lat: center.lat + 0.008, lng: center.lng + 0.01 },
            fee: null,
          },
        ],
        '2026-09-27',
      )
      const provider = new SqliteParkingProvider(db)
      expect(await provider.search({ center, radiusM: 1000 })).toEqual([])
      expect(await provider.getAvailability('corner')).toEqual({
        status: 'unknown',
      })
    } finally {
      db.close()
    }
  })
  it('잘못된 중심 좌표를 거절한다', async () => {
    await expect(
      new SampleParkingProvider().search({
        center: { lat: NaN, lng: 127 },
        radiusM: 1000,
      }),
    ).rejects.toThrow(RangeError)
  })
})
