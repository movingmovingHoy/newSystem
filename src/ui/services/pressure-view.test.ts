import { describe, it, expect } from 'vitest'
import type { Route } from '@shared/types'
import {
  evaluateParkingPressure,
  parkingPressureReasons,
} from '@features/routing/scoring'
import { parkingPressureView } from './display'

/**
 * 임시: Route 에 구조화 필드가 없어 근거 문구(reasons)에서 포화율을 읽는다.
 * 문구가 바뀌어도 조용히 깨지지 않도록, 실제 문구 생성 함수의 출력으로 검증한다.
 */

const route = (scenario: Route['scenario'], reasons: string[]): Route => ({
  scenario,
  legs: [],
  stops: [],
  totals: {
    durationSec: 0,
    cost: 0,
    walkDistanceM: 0,
    transfers: 0,
    fatigue: 0,
    parkingCostPartial: true,
  },
  score: 0,
  reasons,
})

const reasonsFor = (
  ratio: number,
  level: number | null,
  first: { ratio: number } | null,
) =>
  parkingPressureReasons(
    evaluateParkingPressure({ occupancyRatio: ratio, congestionLevel: level }),
    first,
  )

describe('parkingPressureView', () => {
  it('추천이면 포화율·점수·추천 여부를 읽는다', () => {
    const view = parkingPressureView(
      route('park-transit', [
        '이동시간 약 40분',
        ...reasonsFor(0.91, 0, { ratio: 0.3 }),
      ]),
    )
    expect(view).toEqual({
      percent: 91,
      score: 91,
      recommended: true,
      level: 'high',
      firstPercent: null,
      firstUnknown: false,
    })
  })

  it('여유(추천 기준 미만)이면 recommended=false, level 은 포화율로 정한다', () => {
    const low = parkingPressureView(
      route('park-transit', reasonsFor(0.45, 0, { ratio: 0.3 })),
    )
    expect(low?.recommended).toBe(false)
    expect(low?.level).toBe('low')
    const mid = parkingPressureView(
      route('park-transit', reasonsFor(0.66, 0, { ratio: 0.3 })),
    )
    expect(mid?.level).toBe('mid')
    expect(mid?.percent).toBe(66)
  })

  it('경계: 50% 부터 mid, 추천 기준과 같은 70% 부터 high', () => {
    const level = (ratio: number) =>
      parkingPressureView(
        route('park-transit', reasonsFor(ratio, null, { ratio: 0.1 })),
      )?.level
    expect(level(0.49)).toBe('low')
    expect(level(0.5)).toBe('mid')
    expect(level(0.69)).toBe('mid')
    expect(level(0.7)).toBe('high')
  })

  it('점수는 "주차 혼잡 점수" 하나만 읽고 구성은 문구에 없다', () => {
    const reasons = reasonsFor(0.7, 2, { ratio: 0.3 })
    expect(reasons.join(' ')).not.toContain('혼잡 가산')
    // 70 + 13.33 = 83.33 → 83
    expect(parkingPressureView(route('park-transit', reasons))?.score).toBe(83)
  })

  it('첫 도착지도 포화여서 추천을 뺀 경우 첫 도착지 포화율을 담는다', () => {
    const view = parkingPressureView(
      route('park-transit', reasonsFor(0.9, 0, { ratio: 0.85 })),
    )
    expect(view?.recommended).toBe(false)
    expect(view?.firstPercent).toBe(85)
    expect(view?.percent).toBe(90)
  })

  it('첫 도착지 정보가 없으면 firstUnknown=true 이고 추천은 유지한다', () => {
    const view = parkingPressureView(
      route('park-transit', reasonsFor(0.9, 0, null)),
    )
    expect(view?.firstUnknown).toBe(true)
    expect(view?.recommended).toBe(true)
  })

  it('park-transit 가 아니거나 압박 근거가 없으면 null', () => {
    expect(
      parkingPressureView(route('car-direct', reasonsFor(0.9, 0, null))),
    ).toBeNull()
    expect(
      parkingPressureView(route('park-transit', ['이동시간 약 40분'])),
    ).toBeNull()
  })
})
