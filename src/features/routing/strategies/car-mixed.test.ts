import { describe, it, expect } from 'vitest'
import { buildCarRoutes } from './car-mixed'
import type { WaypointParking } from './car-mixed'
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

/** 도보 provider: walkM 로 도보 거리 제어 (임계값 테스트용) */
function walkProvider(walkM: number, sec = 300): RouteProvider {
  return {
    mode: 'walk',
    async route(q: RouteQuery): Promise<Leg[]> {
      return [leg('walk', q, sec, { walkDistanceM: walkM })]
    },
  }
}

function transitProvider(sec = 120): RouteProvider {
  return {
    mode: 'transit',
    async route(q: RouteQuery): Promise<Leg[]> {
      return [
        leg('subway', q, sec, { cost: 1400, transfers: 1, walkDistanceM: 50 }),
      ]
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

describe('buildCarRoutes', () => {
  it('car-direct와 mixed를 모두 만든다', async () => {
    const res = await buildCarRoutes(
      {
        car: carProvider(),
        walk: walkProvider(200),
        transit: transitProvider(),
      },
      {
        origin,
        destination,
        ordered: [parking('A', 2000)],
        departAt: '2026-09-21T09:00:00.000Z',
        preference: 'time',
      },
    )
    expect(res.carDirect.scenario).toBe('car-direct')
    expect(res.mixed.scenario).toBe('mixed')
    // car-direct 접근은 항상 도보
    expect(res.carDirect.stops[0].accessMode).toBe('walk')
  })

  it('도보 거리가 짧으면(임계값 이하) mixed도 도보 접근이라 identical=true', async () => {
    // 도보 200m < WALK_ONLY_THRESHOLD_M(400) → 대중교통 계산 생략
    const res = await buildCarRoutes(
      {
        car: carProvider(),
        walk: walkProvider(200),
        transit: transitProvider(60),
      },
      {
        origin,
        destination,
        ordered: [parking('A', 2000)],
        departAt: '2026-09-21T09:00:00.000Z',
        preference: 'time',
      },
    )
    expect(res.identical).toBe(true)
    expect(res.mixed.stops[0].accessMode).toBe('walk')
  })

  it('도보가 멀고 대중교통이 더 빠르면 mixed는 transit 접근을 고른다', async () => {
    // 도보 800m(>400) & 도보 왕복 600s vs 대중교통 왕복 120s → transit
    const res = await buildCarRoutes(
      {
        car: carProvider(),
        walk: walkProvider(800, 300),
        transit: transitProvider(60),
      },
      {
        origin,
        destination,
        ordered: [parking('A', 2000)],
        departAt: '2026-09-21T09:00:00.000Z',
        preference: 'time',
      },
    )
    expect(res.mixed.stops[0].accessMode).toBe('transit')
    expect(res.identical).toBe(false)
  })

  it('주차비 정보가 없는 경유지가 있으면 parkingCostPartial=true, 근거 표시', async () => {
    const res = await buildCarRoutes(
      {
        car: carProvider(),
        walk: walkProvider(200),
        transit: transitProvider(),
      },
      {
        origin,
        destination,
        ordered: [parking('A', 0, true)], // fee null
        departAt: '2026-09-21T09:00:00.000Z',
        preference: 'cost',
      },
    )
    expect(res.carDirect.totals.parkingCostPartial).toBe(true)
    expect(
      res.carDirect.reasons.some((r) => r.includes('주차비 일부 정보 없음')),
    ).toBe(true)
  })

  it('주차비가 있으면 totals.cost에 주차비가 더해진다', async () => {
    const res = await buildCarRoutes(
      {
        car: carProvider(),
        walk: walkProvider(200),
        transit: transitProvider(),
      },
      {
        origin,
        destination,
        ordered: [parking('A', 3000)],
        departAt: '2026-09-21T09:00:00.000Z',
        preference: 'cost',
      },
    )
    // 자차 2구간(출발→주차, 주차→도착) cost 500*2 + 주차비 3000 = 4000
    expect(res.carDirect.totals.cost).toBe(4000)
  })
})
