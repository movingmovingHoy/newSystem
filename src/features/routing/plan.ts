import type { LatLng, Route, Waypoint } from '@shared/types'
import { REALTIME_PARKING_MAX_DELAY_MIN, type Preference } from '@shared/config'
import type { RouteProvider } from './providers'
import {
  evaluateParkingPressure,
  parkingPressureReasons,
} from './scoring/parking-pressure'
import { CachedRouteProvider } from '@shared/cache'
import {
  optimizeOrder,
  START_ID,
  type OptimizerWaypoint,
} from './optimizer/optimizer'
import { buildTransitOnlyRoute } from './strategies/transit-only'
import { buildCarRoutes, type WaypointParking } from './strategies/car-mixed'
import { buildParkTransitRoute } from './strategies/park-transit'

/**
 * 경로 플래너 (A 담당 오케스트레이터). AGENTS.md 7장 전체 흐름.
 * 입력(출발 + 도착지들 + 주차선택) → 순서 최적화 → 시나리오 3종 Route[] 생성.
 *
 * "최종 도착지" 고정 개념이 없다. 도착지는 1~3개이며 모두 순번 대상이고,
 * 순서상 마지막으로 방문하는 도착지가 그 여정의 종점이 된다.
 * 순서 최적화는 자차 구간 소요시간으로 한다 (AGENTS.md 9장, 직선거리 근사 금지).
 * 주차장 선택 결과는 입력으로 받는다 (실제 후보 선정은 B 담당 parking/finder).
 */

export type PlanWaypoint = {
  waypoint: Waypoint
  /** 이 도착지에 대해 선택된 주차장 */
  parkingLotId: string
  parkingLocation: LatLng
  /** null = 요금 정보 없음 */
  parkingFee: number | null
}

export type PlanInput = {
  origin: LatLng
  /** 도착지 목록 (최소 1개). 순서상 마지막이 종점이 된다. */
  waypoints: PlanWaypoint[]
  departAt: string
  preference: Preference
  congestionLevelAt?: (loc: LatLng, arriveAt: Date) => Promise<number | null>
  /**
   * 위치 인근의 실시간 주차 포화율(0~1) 조회. AGENTS.md 8-2.
   * 넘기지 않으면 기존 동작(park-transit 항상 생성, 주차 근거 없음).
   * 넘기면 최종 도착지 인근 정보가 없을 때(null) park-transit 를 만들지 않는다.
   */
  parkingOccupancyAt?: (loc: LatLng) => Promise<{ ratio: number } | null>
  /** 현재 시각. 실시간 값은 "지금"뿐이라 출발 지연 판단에 쓴다. 테스트 주입용, 기본 new Date() */
  now?: Date
}

export type PlanProviders = {
  car: RouteProvider
  walk: RouteProvider
  transit: RouteProvider
}

/** 순서 최적화용: 필요한 자차 구간 소요시간을 미리 모아 동기 조회표를 만든다. */
async function buildCarDurationTable(
  car: RouteProvider,
  pointById: Map<string, LatLng>,
  departAt: string,
): Promise<Map<string, number>> {
  const ids = [...pointById.keys()]
  const table = new Map<string, number>()
  // 필요한 모든 유향 구간(id → id)을 조회. 경유지 최대 3개라 조합이 작다.
  await Promise.all(
    ids.flatMap((from) =>
      ids
        .filter((to) => to !== from)
        .map(async (to) => {
          const [leg] = await car.route({
            from: pointById.get(from)!,
            to: pointById.get(to)!,
            departAt,
          })
          table.set(`${from}->${to}`, leg.durationSec)
        }),
    ),
  )
  return table
}

export type PlanResult = {
  /** 확정된 방문 순서 (도착지 id). 마지막 항목이 종점이다. */
  order: string[]
  /** 점수 오름차순으로 정렬된 시나리오 경로들 */
  routes: Route[]
}

export async function planRoutes(
  providers: PlanProviders,
  input: PlanInput,
): Promise<PlanResult> {
  const { origin, waypoints, departAt, preference } = input

  if (waypoints.length === 0) {
    throw new Error('도착지는 최소 1개가 필요합니다.')
  }

  // provider를 캐시 래퍼로 감싼다 (AGENTS.md 14장). 같은 키는 1번만 호출,
  // 동시 요청 합치기, 실패 시 만료 캐시 반환.
  const cachedProviders: PlanProviders = {
    car: new CachedRouteProvider(providers.car, { fallbackToStale: true }),
    walk: new CachedRouteProvider(providers.walk, { fallbackToStale: true }),
    transit: new CachedRouteProvider(providers.transit, {
      fallbackToStale: true,
    }),
  }

  // 1) 순서 최적화 (자차 구간 시간 기준). START만 고정, 도착지는 모두 순번 대상.
  const pointById = new Map<string, LatLng>()
  pointById.set(START_ID, origin)
  for (const w of waypoints) pointById.set(w.waypoint.id, w.waypoint.location)

  const table = await buildCarDurationTable(
    cachedProviders.car,
    pointById,
    departAt,
  )
  const optimizerWaypoints: OptimizerWaypoint[] = waypoints.map((w) => ({
    id: w.waypoint.id,
    fixedIndex: w.waypoint.fixedIndex,
  }))
  const { best } = optimizeOrder({
    waypoints: optimizerWaypoints,
    legDurationSec: (from, to) => table.get(`${from}->${to}`) ?? 0,
  })

  // 확정 순서대로 재배열. 순서상 마지막 도착지가 종점이 된다.
  const byId = new Map(waypoints.map((w) => [w.waypoint.id, w]))
  const orderedPlan = best.order.map((id) => byId.get(id)!)
  const endpoint = orderedPlan[orderedPlan.length - 1]
  const destination = endpoint.waypoint.location
  // 앞쪽 도착지들(=종점 제외)만 경유 지점으로 넘긴다. 종점의 체류시간은
  // 도착으로 여정이 끝나므로 최종 시각/타임라인 계산에 포함하지 않는다.
  const middlePlan = orderedPlan.slice(0, -1)
  const orderedWaypoints: Waypoint[] = middlePlan.map((p) => p.waypoint)
  const orderedParking: WaypointParking[] = middlePlan.map((p) => ({
    waypoint: p.waypoint,
    parkingLotId: p.parkingLotId,
    parkingLocation: p.parkingLocation,
    parkingFee: p.parkingFee,
  }))

  // 2) 시나리오 3종 생성. destination = 순서상 마지막 도착지 위치.
  const carRoutes = await buildCarRoutes(cachedProviders, {
    origin,
    destination,
    ordered: orderedParking,
    departAt,
    preference,
    congestionLevelAt: input.congestionLevelAt,
  })
  const transitOnly = await buildTransitOnlyRoute(cachedProviders.transit, {
    origin,
    destination,
    orderedWaypoints,
    departAt,
    preference,
    congestionLevelAt: input.congestionLevelAt,
  })

  // car-direct 와 mixed 가 동일하면 하나로 합친다 (AGENTS.md 8장)
  const routes: Route[] = carRoutes.identical
    ? [carRoutes.carDirect, transitOnly]
    : [carRoutes.carDirect, carRoutes.mixed, transitOnly]

  // 주차 후 대중교통 전환(park-transit): 출발 1 + 도착 정확히 2개일 때만 (AGENTS.md 8-1).
  // 확정된 방문 순서를 그대로 따른다: 첫 도착지에 주차하고, 둘째 도착지는
  // 대중교통으로 간다. 방문 순서를 바꾸면 이 시나리오도 그 순서로 다시 계산된다.
  if (orderedPlan.length === 2) {
    const toWaypoint = (p: (typeof orderedPlan)[number]): Waypoint => ({
      id: p.waypoint.id,
      location: p.waypoint.location,
      dwellMin: p.waypoint.dwellMin,
    })
    const first = toWaypoint(orderedPlan[0])
    const second = toWaypoint(orderedPlan[1])

    // 실시간 주차 정보 (AGENTS.md 8-2). 조회를 넘기지 않으면 기존 동작을 유지한다.
    // 최종 도착지(B) 인근 정보가 없으면(또는 출발이 너무 늦으면) 만들지 않는다.
    const lookup = input.parkingOccupancyAt
    let destOccupancy: { ratio: number } | null = null
    let firstOccupancy: { ratio: number } | null = null
    let include = true
    if (lookup) {
      const safeLookup = async (loc: LatLng) => {
        try {
          return await lookup(loc)
        } catch {
          // 조회 실패는 "정보 없음"으로 본다. 다른 시나리오 계산은 계속한다.
          return null
        }
      }
      const delayMin =
        (Date.parse(departAt) - (input.now ?? new Date()).getTime()) / 60_000
      destOccupancy =
        delayMin > REALTIME_PARKING_MAX_DELAY_MIN
          ? null
          : await safeLookup(second.location)
      if (destOccupancy) firstOccupancy = await safeLookup(first.location)
      include = destOccupancy !== null
    }

    if (include) {
      const parkTransit = await buildParkTransitRoute(cachedProviders, {
        origin,
        parkAt: first,
        destination: second,
        departAt,
        preference,
        congestionLevelAt: input.congestionLevelAt,
      })
      if (destOccupancy) {
        // B 도착 시각 = A 출발 시각 + 대중교통 소요 (자차 구간 뒤 체류 후 출발)
        const transitSec = parkTransit.legs
          .slice(1)
          .reduce((sum, leg) => sum + leg.durationSec, 0)
        const arriveAtB = new Date(
          Date.parse(parkTransit.stops[0].departAt) + transitSec * 1000,
        )
        const level = input.congestionLevelAt
          ? await input.congestionLevelAt(second.location, arriveAtB)
          : null
        const pressure = evaluateParkingPressure({
          occupancyRatio: destOccupancy.ratio,
          congestionLevel: level,
        })
        parkTransit.reasons = [
          ...parkTransit.reasons,
          ...parkingPressureReasons(pressure, firstOccupancy),
        ]
      }
      routes.push(parkTransit)
    }
  }

  routes.sort((a, b) => a.score - b.score)

  return { order: best.order, routes }
}
