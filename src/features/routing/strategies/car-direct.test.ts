import { describe, it, expect } from 'vitest'
import { buildCarRoute } from './car-direct'
import type { WaypointParking } from './car-direct'
import type { RouteProvider, RouteQuery } from '../providers'
import type { Leg } from '@shared/types'

const origin = { lat: 37.5547, lng: 126.9707 }
const destination = { lat: 37.4979, lng: 127.0276 }

function carProvider(sec = 900): RouteProvider {
  return {
    mode: 'car',
    async route(q: RouteQuery): Promise<Leg[]> {
      return [leg('car', q, sec, { cost: 500 })]
    },
  }
}

function walkProvider(walkM = 200, sec = 300): RouteProvider {
  return {
    mode: 'walk',
    async route(q: RouteQuery): Promise<Leg[]> {
      return [leg('walk', q, sec, { walkDistanceM: walkM })]
    },
  }
}

function leg(
  mode: Leg['mode'],
  q: RouteQuery,
  durationSec: number,
  extra: Partial<Leg>,
): Leg {
  return {
    mode,
    from: q.from,
    to: q.to,
    departAt: q.departAt ?? '',
    arriveAt: '',
    durationSec,
    cost: 0,
    walkDistanceM: 0,
    transfers: 0,
    fatigue: 0,
    ...extra,
  }
}

const parking = (
  id: string,
  fee: number | null,
  feeNull = false,
): WaypointParking => ({
  waypoint: {
    id,
    location: { lat: 37.52, lng: 127.0 },
    dwellMin: 60,
  },
  parkingLotId: `lot-${id}`,
  parkingLocation: { lat: 37.521, lng: 127.001 },
  parkingFee: feeNull ? null : fee,
})

const baseInput = {
  origin,
  destination,
  departAt: '2026-09-21T09:00:00.000Z',
  preference: 'time' as const,
}

describe('buildCarRoute (자차: 주차 후 도보로 왕복)', () => {
  it('car-direct 경로 하나를 만들고 접근은 항상 도보다', async () => {
    const route = await buildCarRoute(
      { car: carProvider(), walk: walkProvider() },
      { ...baseInput, ordered: [parking('A', 2000)] },
    )
    expect(route.scenario).toBe('car-direct')
    expect(route.stops[0].accessMode).toBe('walk')
  })

  it('도보가 멀어도 대중교통으로 바꾸지 않는다 (접근 provider는 walk만 쓴다)', async () => {
    const route = await buildCarRoute(
      { car: carProvider(), walk: walkProvider(2000, 1500) },
      { ...baseInput, ordered: [parking('A', 2000)] },
    )
    expect(route.stops[0].accessMode).toBe('walk')
    const access = route.legs.filter((l) => l.role !== 'drive')
    expect(access.every((l) => l.mode === 'walk')).toBe(true)
  })

  it('구간 순서는 차 → 도보(가기) → 도보(돌아오기) → 차 이다', async () => {
    const route = await buildCarRoute(
      { car: carProvider(), walk: walkProvider() },
      { ...baseInput, ordered: [parking('A', 2000)] },
    )
    expect(route.legs.map((l) => l.role)).toEqual([
      'drive',
      'access-out',
      'access-back',
      'drive',
    ])
  })

  it('경유지가 둘이면 차 이동 사이사이에 도보 왕복이 들어간다', async () => {
    const route = await buildCarRoute(
      { car: carProvider(), walk: walkProvider() },
      { ...baseInput, ordered: [parking('A', 2000), parking('B', 1000)] },
    )
    expect(route.legs.map((l) => l.role)).toEqual([
      'drive',
      'access-out',
      'access-back',
      'drive',
      'access-out',
      'access-back',
      'drive',
    ])
  })

  it('주차비 정보가 없는 경유지가 있으면 parkingCostPartial=true, 근거 표시', async () => {
    const route = await buildCarRoute(
      { car: carProvider(), walk: walkProvider() },
      {
        ...baseInput,
        ordered: [parking('A', 0, true)], // fee null
        preference: 'cost',
      },
    )
    expect(route.totals.parkingCostPartial).toBe(true)
    expect(route.reasons.some((r) => r.includes('주차비 일부 정보 없음'))).toBe(
      true,
    )
  })

  it('주차비가 있으면 totals.cost에 주차비가 더해진다', async () => {
    const route = await buildCarRoute(
      { car: carProvider(), walk: walkProvider() },
      {
        ...baseInput,
        ordered: [parking('A', 3000)],
        preference: 'cost',
      },
    )
    // 자차 2구간(출발→주차, 주차→도착) cost 500*2 + 주차비 3000 = 4000
    expect(route.totals.cost).toBe(4000)
  })

  it('자차 구간의 정체 시간이 피로도에 반영된다 (정체 1분당 0.8점)', async () => {
    const jammedCar: RouteProvider = {
      mode: 'car',
      async route(q: RouteQuery): Promise<Leg[]> {
        // 구간마다 정체 600초(10분)
        return [leg('car', q, 900, { cost: 500, congestedDriveSec: 600 })]
      },
    }
    const input = { ...baseInput, ordered: [parking('A', 2000)] }
    const calm = await buildCarRoute(
      { car: carProvider(), walk: walkProvider() },
      input,
    )
    const jam = await buildCarRoute(
      { car: jammedCar, walk: walkProvider() },
      input,
    )
    // 자차 2구간 × 10분 = 20분 정체 → 20 × 0.8 = 16점 증가
    expect(jam.totals.fatigue - calm.totals.fatigue).toBeCloseTo(16)
    // 피로도가 올라간 만큼 종합점수는 나빠진다(커진다)
    expect(jam.score).toBeGreaterThan(calm.score)
  })
})
