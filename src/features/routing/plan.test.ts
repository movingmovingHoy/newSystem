import { describe, it, expect } from 'vitest'
import { planRoutes } from './plan'
import type { PlanProviders, PlanWaypoint } from './plan'
import type { RouteProvider, RouteQuery } from './providers'
import type { Leg, Waypoint } from '@shared/types'

const origin = { lat: 37.5547, lng: 126.9707 }

function leg(
  mode: Leg['mode'],
  q: RouteQuery,
  sec: number,
  extra: Partial<Leg>,
): Leg {
  return {
    mode,
    from: q.from,
    to: q.to,
    departAt: q.departAt ?? '',
    arriveAt: '',
    durationSec: sec,
    cost: 0,
    walkDistanceM: 0,
    transfers: 0,
    fatigue: 0,
    ...extra,
  }
}

/** 자차 provider: 좌표 위도차로 소요시간을 만들어 순서 최적화가 의미있게 동작하도록 */
function carProvider(): RouteProvider {
  return {
    mode: 'car',
    async route(q: RouteQuery): Promise<Leg[]> {
      const sec = Math.round(Math.abs(q.from.lat - q.to.lat) * 100000) + 60
      return [leg('car', q, sec, { cost: 500 })]
    },
  }
}
function walkProvider(): RouteProvider {
  return {
    mode: 'walk',
    async route(q: RouteQuery): Promise<Leg[]> {
      return [leg('walk', q, 200, { walkDistanceM: 150 })]
    },
  }
}
function transitProvider(): RouteProvider {
  return {
    mode: 'transit',
    async route(q: RouteQuery): Promise<Leg[]> {
      return [
        leg('subway', q, 500, { cost: 1400, transfers: 1, walkDistanceM: 100 }),
      ]
    },
  }
}

const providers: PlanProviders = {
  car: carProvider(),
  walk: walkProvider(),
  transit: transitProvider(),
}

const planWp = (
  id: string,
  lat: number,
  lng: number,
  fixedIndex?: number,
): PlanWaypoint => {
  const waypoint: Waypoint = {
    id,
    location: { lat, lng },
    dwellMin: 30,
    ...(fixedIndex !== undefined ? { fixedIndex } : {}),
  }
  return {
    waypoint,
    parkingLotId: `lot-${id}`,
    parkingLocation: { lat: lat + 0.001, lng: lng + 0.001 },
    parkingFee: 2000,
  }
}

describe('planRoutes', () => {
  it('도착지 순서를 최적화하고 시나리오 경로들을 점수순으로 반환한다', async () => {
    const result = await planRoutes(providers, {
      origin,
      waypoints: [planWp('A', 37.53, 127.0), planWp('B', 37.51, 127.01)],
      departAt: '2026-09-21T09:00:00.000Z',
      preference: 'time',
    })

    // 도착지 2개 모두 순서에 포함 (마지막이 종점)
    expect(result.order).toHaveLength(2)
    expect(result.routes.length).toBeGreaterThanOrEqual(2)
    // 점수 오름차순
    for (let i = 1; i < result.routes.length; i++) {
      expect(result.routes[i].score).toBeGreaterThanOrEqual(
        result.routes[i - 1].score,
      )
    }
    // 시나리오가 모두 포함
    const scenarios = result.routes.map((r) => r.scenario)
    expect(scenarios).toContain('car-direct')
    expect(scenarios).toContain('transit-only')
    // 도착지 2개이므로 park-transit(자차 주차 후 대중교통)도 포함
    expect(scenarios).toContain('park-transit')
  })

  it('도착지 3개면 park-transit는 제공하지 않는다 (출발1+도착2 한정)', async () => {
    const result = await planRoutes(providers, {
      origin,
      waypoints: [
        planWp('A', 37.53, 127.0),
        planWp('B', 37.51, 127.01),
        planWp('C', 37.52, 127.02),
      ],
      departAt: '2026-09-21T09:00:00.000Z',
      preference: 'time',
    })
    expect(result.routes.map((r) => r.scenario)).not.toContain('park-transit')
  })

  it('방문 순서를 바꾸면 park-transit의 주차지(첫 도착지)도 그 순서를 따른다', async () => {
    const parkTransitParkId = async (
      firstFixed: 'A' | 'B',
    ): Promise<string | undefined> => {
      const result = await planRoutes(providers, {
        origin,
        waypoints: [
          planWp('A', 37.53, 127.0, firstFixed === 'A' ? 0 : 1),
          planWp('B', 37.51, 127.01, firstFixed === 'B' ? 0 : 1),
        ],
        departAt: '2026-09-21T09:00:00.000Z',
        preference: 'time',
      })
      const pt = result.routes.find((r) => r.scenario === 'park-transit')
      // park-transit는 주차지(첫 도착지) 하나만 stop 으로 가진다
      return pt?.stops[0]?.waypointId
    }
    // A를 먼저 방문하면 A에 주차, B를 먼저 방문하면 B에 주차
    expect(await parkTransitParkId('A')).toBe('A')
    expect(await parkTransitParkId('B')).toBe('B')
  })

  it('fixedIndex가 있는 도착지는 그 순번에 고정된다', async () => {
    const result = await planRoutes(providers, {
      origin,
      waypoints: [
        planWp('A', 37.53, 127.0),
        planWp('B', 37.51, 127.01, 0), // B를 0번에 고정
        planWp('C', 37.52, 127.02),
      ],
      departAt: '2026-09-21T09:00:00.000Z',
      preference: 'time',
    })
    expect(result.order[0]).toBe('B')
    expect(result.order).toHaveLength(3)
  })

  it('도착지 1개면 그 도착지가 곧 종점이다', async () => {
    const result = await planRoutes(providers, {
      origin,
      waypoints: [planWp('A', 37.53, 127.0)],
      departAt: '2026-09-21T09:00:00.000Z',
      preference: 'cost',
    })
    expect(result.order).toEqual(['A'])
    expect(result.routes.length).toBeGreaterThanOrEqual(2)
  })

  it('도착지가 없으면 에러를 던진다 (최소 1개)', async () => {
    await expect(
      planRoutes(providers, {
        origin,
        waypoints: [],
        departAt: '2026-09-21T09:00:00.000Z',
        preference: 'cost',
      }),
    ).rejects.toThrow()
  })

  it('혼잡도 조회를 넘기면 경로 점수/근거에 반영된다', async () => {
    const result = await planRoutes(providers, {
      origin,
      // 도착지 2개: 앞쪽 도착지는 stop 으로, 마지막은 종점으로 반영된다
      waypoints: [planWp('A', 37.53, 127.0), planWp('B', 37.51, 127.01)],
      departAt: '2026-09-21T09:00:00.000Z',
      preference: 'time',
      congestionLevelAt: async () => 3,
    })
    // 앞쪽 도착지 stop 에 혼잡 레벨이 실린다
    const anyStopWithLevel = result.routes.some((r) =>
      r.stops.some((s) => s.congestion.level === 3),
    )
    expect(anyStopWithLevel).toBe(true)
  })
})
