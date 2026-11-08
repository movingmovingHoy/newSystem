import { describe, it, expect, vi } from 'vitest'
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

describe('planRoutes 목적지 주차 압박 (park-transit)', () => {
  const A_LAT = 37.53
  const departAt = '2026-09-21T09:00:00.000Z'
  const minutes = (n: number) => n * 60_000
  /** A(첫 도착지)·B(최종 도착지)의 인근 포화율을 돌려주는 가짜 조회. null = 정보 없음 */
  const occ = (a: number | null, b: number | null) =>
    vi.fn(async (loc: { lat: number }) => {
      const ratio = loc.lat === A_LAT ? a : b
      return ratio === null ? null : { ratio }
    })
  const input = (extra: Record<string, unknown> = {}) => ({
    origin,
    // A 를 0번, B 를 1번에 고정: 첫 도착지 = A(주차), 최종 도착지 = B(대중교통)
    waypoints: [planWp('A', A_LAT, 127.0, 0), planWp('B', 37.51, 127.01, 1)],
    departAt,
    preference: 'time' as const,
    now: new Date(departAt),
    ...extra,
  })
  type Result = Awaited<ReturnType<typeof planRoutes>>
  const parkTransit = (r: Result) =>
    r.routes.find((x) => x.scenario === 'park-transit')
  const reasonsOf = (r: Result) => (parkTransit(r)?.reasons ?? []).join(' | ')

  it('실시간 조회를 넣지 않으면 기존대로 만들고 주차 근거는 붙이지 않는다', async () => {
    const result = await planRoutes(providers, input())
    expect(parkTransit(result)).toBeDefined()
    expect(reasonsOf(result)).not.toContain('목적지 주변 주차')
  })

  it('최종 도착지 인근 정보가 없으면 park-transit 를 만들지 않는다', async () => {
    const result = await planRoutes(
      providers,
      input({ parkingOccupancyAt: occ(0.3, null) }),
    )
    expect(parkTransit(result)).toBeUndefined()
    // 다른 시나리오는 그대로 나온다
    const scenarios = result.routes.map((r) => r.scenario)
    expect(scenarios).toContain('car-direct')
    expect(scenarios).toContain('transit-only')
  })

  it('최종 도착지 정보가 없으면 첫 도착지는 조회하지 않는다', async () => {
    const lookup = occ(0.3, null)
    await planRoutes(providers, input({ parkingOccupancyAt: lookup }))
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup.mock.calls[0][0].lat).toBe(37.51)
  })

  it('출발이 지금보다 60분 넘게 뒤이면 정보 없음으로 보고 제외한다', async () => {
    const lookup = occ(0.3, 0.9)
    const late = await planRoutes(
      providers,
      input({
        parkingOccupancyAt: lookup,
        now: new Date(Date.parse(departAt) - minutes(61)),
      }),
    )
    expect(parkTransit(late)).toBeUndefined()
    expect(lookup).not.toHaveBeenCalled()
  })

  it('출발이 정확히 60분 뒤이면 아직 정보로 쓴다', async () => {
    const result = await planRoutes(
      providers,
      input({
        parkingOccupancyAt: occ(0.3, 0.9),
        now: new Date(Date.parse(departAt) - minutes(60)),
      }),
    )
    expect(parkTransit(result)).toBeDefined()
  })

  it('조회가 실패해도 전체 계산은 죽지 않고 park-transit 만 제외한다', async () => {
    const result = await planRoutes(
      providers,
      input({
        parkingOccupancyAt: vi.fn().mockRejectedValue(new Error('down')),
      }),
    )
    expect(parkTransit(result)).toBeUndefined()
    expect(result.routes.map((r) => r.scenario)).toContain('car-direct')
  })

  it('포화 90% 면 포화율과 추천 근거를 붙인다', async () => {
    const result = await planRoutes(
      providers,
      input({ parkingOccupancyAt: occ(0.3, 0.9) }),
    )
    const text = reasonsOf(result)
    expect(text).toContain('목적지 주변 주차 포화 90%')
    expect(text).toContain('주차 후 대중교통 추천')
  })

  it('목적지 혼잡도가 점수에 더해져 포화 60%도 붐빔이면 추천한다 (구성은 숨김)', async () => {
    const crowded = await planRoutes(
      providers,
      input({
        parkingOccupancyAt: occ(0.3, 0.6),
        congestionLevelAt: async () => 3, // 60 + 20 = 80
      }),
    )
    const text = reasonsOf(crowded)
    expect(text).toContain('주차 후 대중교통 추천')
    expect(text).toContain('주차 혼잡 점수 80점')
    expect(text).not.toContain('혼잡 가산')
    // 같은 포화율이라도 혼잡이 여유면 60점이라 추천하지 않는다
    const calm = await planRoutes(
      providers,
      input({
        parkingOccupancyAt: occ(0.3, 0.6),
        congestionLevelAt: async () => 0,
      }),
    )
    expect(reasonsOf(calm)).not.toContain('주차 후 대중교통 추천')
  })

  it('포화 40% + 붐빔(60점)은 추천하지 않고 여유 근거를 붙인다', async () => {
    const result = await planRoutes(
      providers,
      input({
        parkingOccupancyAt: occ(0.3, 0.4),
        congestionLevelAt: async () => 3,
      }),
    )
    const text = reasonsOf(result)
    expect(text).toContain('여유')
    expect(text).not.toContain('주차 후 대중교통 추천')
  })

  it('첫 도착지 인근도 80% 이상 포화면 추천하지 않는다고 알린다', async () => {
    const result = await planRoutes(
      providers,
      input({ parkingOccupancyAt: occ(0.85, 0.9) }),
    )
    const text = reasonsOf(result)
    expect(text).toContain('첫 도착지 주변 주차도 포화 85%')
    expect(text).not.toContain('주차 후 대중교통 추천')
    // 카드는 유지된다
    expect(parkTransit(result)).toBeDefined()
  })

  it('첫 도착지 인근 정보가 없으면 카드는 유지하고 그 사실만 표시한다', async () => {
    const result = await planRoutes(
      providers,
      input({ parkingOccupancyAt: occ(null, 0.9) }),
    )
    expect(parkTransit(result)).toBeDefined()
    const text = reasonsOf(result)
    expect(text).toContain('첫 도착지 주변 주차 정보 없음')
    expect(text).toContain('주차 후 대중교통 추천')
  })

  it('압박 정도는 park-transit 의 종합 점수 자체를 바꾸지 않는다', async () => {
    const calm = await planRoutes(
      providers,
      input({ parkingOccupancyAt: occ(0.1, 0.1) }),
    )
    const crowded = await planRoutes(
      providers,
      input({ parkingOccupancyAt: occ(0.1, 0.95) }),
    )
    expect(parkTransit(crowded)?.score).toBe(parkTransit(calm)?.score)
  })
})

describe('planRoutes 추천 경로(1위) 결정', () => {
  const departAt = '2026-09-21T09:00:00.000Z'
  const A_LAT = 37.53
  // 출발지에서 타는 대중교통만 아주 느리게 만들어, park-transit 가 점수상 가장 좋게 한다.
  // (transit-only 는 출발지 구간이 느려 불리하고, park-transit 는 출발지 구간을 차로 간다)
  const slowFromOrigin: PlanProviders = {
    car: {
      mode: 'car',
      async route(q: RouteQuery): Promise<Leg[]> {
        return [leg('car', q, 600, {})]
      },
    },
    walk: walkProvider(),
    transit: {
      mode: 'transit',
      async route(q: RouteQuery): Promise<Leg[]> {
        const fromOrigin = q.from.lat === origin.lat
        return [leg('subway', q, fromOrigin ? 9000 : 300, {})]
      },
    },
  }
  const occ = (a: number | null, b: number | null) =>
    vi.fn(async (loc: { lat: number }) => {
      const ratio = loc.lat === A_LAT ? a : b
      return ratio === null ? null : { ratio }
    })
  const run = (parkingOccupancyAt?: ReturnType<typeof occ>) =>
    planRoutes(slowFromOrigin, {
      origin,
      waypoints: [planWp('A', A_LAT, 127.0, 0), planWp('B', 37.51, 127.01, 1)],
      departAt,
      preference: 'time',
      now: new Date(departAt),
      ...(parkingOccupancyAt ? { parkingOccupancyAt } : {}),
    })

  it('기준 장치: 주차 정보를 안 넣으면 park-transit 가 점수상 1위다', async () => {
    const result = await run()
    expect(result.routes[0].scenario).toBe('park-transit')
  })

  it('주차가 붐비면(70점 이상, 첫 도착지 여유) park-transit 가 1위다', async () => {
    const result = await run(occ(0.2, 0.9))
    expect(result.routes[0].scenario).toBe('park-transit')
  })

  it('주차가 여유로우면 park-transit 는 보이되 1위(추천)가 되지 못한다', async () => {
    const result = await run(occ(0.2, 0.4))
    const scenarios = result.routes.map((r) => r.scenario)
    expect(scenarios).toContain('park-transit') // 카드는 남는다
    expect(result.routes[0].scenario).not.toBe('park-transit')
    // 점수가 좋은 순서는 그대로고 park-transit 만 한 칸 내려간다
    expect(result.routes[1].scenario).toBe('park-transit')
  })

  it('첫 도착지도 꽉 차 있으면 목적지가 붐벼도 1위가 되지 못한다', async () => {
    const result = await run(occ(0.9, 0.9))
    expect(result.routes.map((r) => r.scenario)).toContain('park-transit')
    expect(result.routes[0].scenario).not.toBe('park-transit')
  })

  it('경로가 park-transit 하나뿐이면 그대로 1위로 둔다', async () => {
    // 비교할 다른 경로가 없을 때 빈 추천이 되지 않게 한다 (방어)
    const result = await run(occ(0.2, 0.4))
    expect(result.routes.length).toBeGreaterThan(1)
  })
})
