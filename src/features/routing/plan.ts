import type { LatLng, Route, Waypoint } from '@shared/types'
import type { Preference } from '@shared/config'
import type { RouteProvider } from './providers'
import { CachedRouteProvider } from '@shared/cache'
import {
  optimizeOrder,
  START_ID,
  END_ID,
  type OptimizerWaypoint,
} from './optimizer/optimizer'
import { buildTransitOnlyRoute } from './strategies/transit-only'
import { buildCarRoutes, type WaypointParking } from './strategies/car-mixed'

/**
 * 경로 플래너 (A 담당 오케스트레이터). AGENTS.md 7장 전체 흐름.
 * 입력(출발/도착/경유지+주차선택) → 순서 최적화 → 시나리오 3종 Route[] 생성.
 *
 * 순서 최적화는 자차 구간 소요시간으로 한다 (AGENTS.md 9장, 직선거리 근사 금지).
 * 주차장 선택 결과는 입력으로 받는다 (실제 후보 선정은 B 담당 parking/finder).
 */

export type PlanWaypoint = {
  waypoint: Waypoint
  /** 이 경유지에 대해 선택된 주차장 */
  parkingLotId: string
  parkingLocation: LatLng
  /** null = 요금 정보 없음 */
  parkingFee: number | null
}

export type PlanInput = {
  origin: LatLng
  destination: LatLng
  waypoints: PlanWaypoint[]
  departAt: string
  preference: Preference
  congestionLevelAt?: (loc: LatLng, arriveAt: Date) => Promise<number | null>
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
  /** 확정된 방문 순서 (경유지 id) */
  order: string[]
  /** 점수 오름차순으로 정렬된 시나리오 경로들 */
  routes: Route[]
}

export async function planRoutes(
  providers: PlanProviders,
  input: PlanInput,
): Promise<PlanResult> {
  const { origin, destination, waypoints, departAt, preference } = input

  // provider를 캐시 래퍼로 감싼다 (AGENTS.md 14장). 같은 키는 1번만 호출,
  // 동시 요청 합치기, 실패 시 만료 캐시 반환.
  const cachedProviders: PlanProviders = {
    car: new CachedRouteProvider(providers.car, { fallbackToStale: true }),
    walk: new CachedRouteProvider(providers.walk, { fallbackToStale: true }),
    transit: new CachedRouteProvider(providers.transit, {
      fallbackToStale: true,
    }),
  }

  // 1) 순서 최적화 (자차 구간 시간 기준)
  const pointById = new Map<string, LatLng>()
  pointById.set(START_ID, origin)
  pointById.set(END_ID, destination)
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

  // 확정 순서대로 재배열
  const byId = new Map(waypoints.map((w) => [w.waypoint.id, w]))
  const orderedPlan = best.order.map((id) => byId.get(id)!)
  const orderedWaypoints: Waypoint[] = orderedPlan.map((p) => p.waypoint)
  const orderedParking: WaypointParking[] = orderedPlan.map((p) => ({
    waypoint: p.waypoint,
    parkingLotId: p.parkingLotId,
    parkingLocation: p.parkingLocation,
    parkingFee: p.parkingFee,
  }))

  // 2) 시나리오 3종 생성
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

  routes.sort((a, b) => a.score - b.score)

  return { order: best.order, routes }
}
