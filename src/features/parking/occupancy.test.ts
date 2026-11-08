import { describe, it, expect } from 'vitest'
import { aggregateOccupancy, type LiveParkingLot } from './occupancy'

/**
 * 반경 내 실시간 주차 포화율 집계. AGENTS.md 8-2.
 * 합계 기준(현재 대수 합 ÷ 총 주차면 합)이고, 정보가 없으면 null 이다(0%로 치지 않는다).
 */

const center = { lat: 37.5, lng: 127.0 }
// 위도 0.003도 ≈ 333m (반경 안), 0.02도 ≈ 2.2km (반경 밖)
const near = { lat: 37.503, lng: 127.0 }
const far = { lat: 37.52, lng: 127.0 }
const now = new Date('2026-11-05T10:00:00Z')
const fresh = '2026-11-05T09:50:00Z' // 10분 전
const stale = '2026-11-05T09:00:00Z' // 60분 전

const lot = (over: Partial<LiveParkingLot>): LiveParkingLot => ({
  id: 'seoul:1',
  location: near,
  capacity: 100,
  current: 50,
  updatedAt: fresh,
  ...over,
})

describe('aggregateOccupancy', () => {
  it('평균이 아니라 합계 기준으로 포화율을 계산한다', () => {
    const result = aggregateOccupancy(
      [
        lot({ id: 'a', capacity: 100, current: 90 }), // 90%
        lot({ id: 'b', capacity: 300, current: 30 }), // 10%
      ],
      center,
      1000,
      now,
    )
    // (90+30) / (100+300) = 0.3 (단순 평균이면 0.5)
    expect(result?.ratio).toBeCloseTo(0.3)
    expect(result?.lotCount).toBe(2)
    expect(result?.capacity).toBe(400)
  })

  it('반경 밖 주차장은 집계하지 않는다', () => {
    const result = aggregateOccupancy(
      [
        lot({ id: 'in', capacity: 100, current: 80 }),
        lot({ id: 'out', location: far, capacity: 1000, current: 0 }),
      ],
      center,
      1000,
      now,
    )
    expect(result?.ratio).toBeCloseTo(0.8)
    expect(result?.lotCount).toBe(1)
  })

  it('갱신 시각이 오래된 주차장은 집계에서 뺀다', () => {
    const result = aggregateOccupancy(
      [
        lot({ id: 'fresh', capacity: 100, current: 70 }),
        lot({ id: 'old', capacity: 100, current: 0, updatedAt: stale }),
      ],
      center,
      1000,
      now,
    )
    expect(result?.ratio).toBeCloseTo(0.7)
    expect(result?.lotCount).toBe(1)
  })

  it('최대 허용 경과 시간을 바꿀 수 있다', () => {
    const lots = [lot({ updatedAt: stale })] // 60분 전
    expect(aggregateOccupancy(lots, center, 1000, now)).toBeNull()
    expect(aggregateOccupancy(lots, center, 1000, now, 90)).not.toBeNull()
  })

  it('총 주차면이 0이거나 값이 잘못된 주차장은 무시한다', () => {
    const result = aggregateOccupancy(
      [
        lot({ id: 'zero', capacity: 0, current: 0 }),
        lot({ id: 'nan', capacity: Number.NaN, current: 10 }),
        lot({ id: 'neg', capacity: 100, current: -5 }),
        lot({ id: 'badtime', updatedAt: 'not-a-date' }),
        lot({ id: 'ok', capacity: 200, current: 100 }),
      ],
      center,
      1000,
      now,
    )
    expect(result?.ratio).toBeCloseTo(0.5)
    expect(result?.lotCount).toBe(1)
  })

  it('집계할 주차장이 하나도 없으면 null (정보 없음, 0%가 아님)', () => {
    expect(aggregateOccupancy([], center, 1000, now)).toBeNull()
    expect(
      aggregateOccupancy([lot({ location: far })], center, 1000, now),
    ).toBeNull()
  })

  it('합계 주차면이 너무 작으면 대표성이 없어 정보 없음(null)이다', () => {
    // 11면 1곳의 9%로 주변 전체를 판단하지 않는다 (기준 100면 미만)
    expect(
      aggregateOccupancy(
        [lot({ capacity: 11, current: 1 })],
        center,
        1000,
        now,
      ),
    ).toBeNull()
    // 여러 곳을 합쳐서 기준에 닿으면 쓴다: 60 + 40 = 100면
    const merged = aggregateOccupancy(
      [
        lot({ id: 'a', capacity: 60, current: 30 }),
        lot({ id: 'b', capacity: 40, current: 10 }),
      ],
      center,
      1000,
      now,
    )
    expect(merged?.capacity).toBe(100)
    expect(merged?.ratio).toBeCloseTo(0.4)
  })

  it('기준은 정확히 100면부터 쓰고, 값은 바꿀 수 있다', () => {
    const at = (capacity: number, min?: number) =>
      aggregateOccupancy(
        [lot({ capacity, current: 0 })],
        center,
        1000,
        now,
        undefined,
        min,
      )
    expect(at(99)).toBeNull()
    expect(at(100)).not.toBeNull()
    expect(at(50, 50)).not.toBeNull()
    expect(at(50, 51)).toBeNull()
  })

  it('현재 대수가 총 주차면을 넘으면 포화율은 1로 제한한다', () => {
    const result = aggregateOccupancy(
      [lot({ capacity: 100, current: 130 })],
      center,
      1000,
      now,
    )
    expect(result?.ratio).toBe(1)
  })
})
