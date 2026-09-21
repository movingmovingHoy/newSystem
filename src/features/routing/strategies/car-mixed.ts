import type { LatLng, Leg, Route, Stop, Waypoint } from '@shared/types'
import type { RouteProvider } from '../providers'
import { computeFatigue } from '../scoring/fatigue'
import { scoreRoute } from '../scoring/scoring'
import { buildTimeline } from '../timeline/timeline'
import { sumTotals } from './totals'
import { WALK_ONLY_THRESHOLD_M, type Preference } from '@shared/config'

/**
 * 차량 유지형 경로(car-direct / mixed). AGENTS.md 8장.
 * 차는 출발지 → 경유지별 주차장 → 도착지 로 이동(drive legs).
 * 각 경유지는 주차장에서 접근수단(도보 또는 대중교통)으로 왕복한다.
 *  - car-direct: 접근은 항상 도보
 *  - mixed: 경유지별로 도보/대중교통 중 점수(=시간)가 좋은 쪽
 * 주차장 선택은 두 시나리오가 공유한다. car-direct 와 mixed 결과가 같으면
 * 상위에서 하나로 합칠 수 있다.
 */

/** 경유지 + 선택된 주차장 */
export type WaypointParking = {
  waypoint: Waypoint
  parkingLotId: string
  parkingLocation: LatLng
  /** null = 요금 정보 없음 (AGENTS.md 10장) */
  parkingFee: number | null
}

export type CarRoutesInput = {
  origin: LatLng
  destination: LatLng
  /** 방문 순서대로 정렬된 경유지 + 주차장 선택 */
  ordered: WaypointParking[]
  departAt: string
  preference: Preference
  congestionLevelAt?: (loc: LatLng, arriveAt: Date) => Promise<number | null>
}

type AccessResult = {
  /** access-out + access-back Leg (왕복) */
  legs: Leg[]
  mode: 'walk' | 'transit'
}

async function walkLeg(
  walk: RouteProvider,
  from: LatLng,
  to: LatLng,
  role: Leg['role'],
): Promise<Leg> {
  const [leg] = await walk.route({ from, to })
  return { ...leg, role }
}

/** 주차장↔경유지 왕복 접근 계산. mixed 는 도보/대중교통 비교, car-direct 는 도보 고정 */
async function computeAccess(
  providers: { walk: RouteProvider; transit: RouteProvider },
  parking: LatLng,
  waypoint: LatLng,
  allowTransit: boolean,
): Promise<AccessResult> {
  const walkOut = await walkLeg(providers.walk, parking, waypoint, 'access-out')
  const walkBack = await walkLeg(
    providers.walk,
    waypoint,
    parking,
    'access-back',
  )
  const walkAccess: AccessResult = { legs: [walkOut, walkBack], mode: 'walk' }

  // 도보 거리가 짧으면 대중교통 계산 생략 (AGENTS.md 8장)
  if (!allowTransit || walkOut.walkDistanceM <= WALK_ONLY_THRESHOLD_M) {
    return walkAccess
  }

  const [transitOut] = await providers.transit.route({
    from: parking,
    to: waypoint,
  })
  const [transitBack] = await providers.transit.route({
    from: waypoint,
    to: parking,
  })
  const transitAccess: AccessResult = {
    legs: [
      { ...transitOut, role: 'access-out' },
      { ...transitBack, role: 'access-back' },
    ],
    mode: 'transit',
  }

  // 시간만이 아니라 시간+비용+피로도로 비교해 좋은 쪽 선택 (AGENTS.md 8장).
  // 접근은 짧은 구간이라 간단한 가중합으로 근사한다.
  const accessCost = (legs: Leg[]): number => {
    const sec = legs.reduce((s, l) => s + l.durationSec, 0)
    const won = legs.reduce((s, l) => s + l.cost, 0)
    const walkM = legs.reduce((s, l) => s + l.walkDistanceM, 0)
    const transfers = legs.reduce((s, l) => s + l.transfers, 0)
    // 분 + 비용(백원당 0.5) + 도보(100m당 1) + 환승(회당 3)
    return sec / 60 + (won / 100) * 0.5 + (walkM / 100) * 1 + transfers * 3
  }
  return accessCost(transitAccess.legs) < accessCost(walkAccess.legs)
    ? transitAccess
    : walkAccess
}

export type CarRoutesResult = {
  carDirect: Route
  mixed: Route
  /** car-direct 와 mixed 의 접근수단이 모두 도보로 같으면 true */
  identical: boolean
}

export async function buildCarRoutes(
  providers: {
    car: RouteProvider
    walk: RouteProvider
    transit: RouteProvider
  },
  input: CarRoutesInput,
): Promise<CarRoutesResult> {
  const { origin, destination, ordered, departAt } = input

  // 차 이동 지점: 출발 → 주차장들 → 도착
  const drivePoints: LatLng[] = [
    origin,
    ...ordered.map((o) => o.parkingLocation),
    destination,
  ]
  const driveLegs: Leg[] = []
  for (let i = 0; i < drivePoints.length - 1; i++) {
    const [leg] = await providers.car.route({
      from: drivePoints[i],
      to: drivePoints[i + 1],
      departAt,
    })
    driveLegs.push({ ...leg, role: 'drive' })
  }

  // 경유지별 접근 (car-direct: 도보 고정, mixed: 도보/대중교통 비교)
  const directAccess: AccessResult[] = []
  const mixedAccess: AccessResult[] = []
  for (const o of ordered) {
    directAccess.push(
      await computeAccess(
        providers,
        o.parkingLocation,
        o.waypoint.location,
        false,
      ),
    )
    mixedAccess.push(
      await computeAccess(
        providers,
        o.parkingLocation,
        o.waypoint.location,
        true,
      ),
    )
  }

  const carDirect = assembleRoute('car-direct', input, driveLegs, directAccess)
  const mixed = assembleRoute('mixed', input, driveLegs, mixedAccess)
  const identical = mixedAccess.every((a) => a.mode === 'walk')

  return {
    carDirect: await carDirect,
    mixed: await mixed,
    identical,
  }
}

async function assembleRoute(
  scenario: 'car-direct' | 'mixed',
  input: CarRoutesInput,
  driveLegs: Leg[],
  access: AccessResult[],
): Promise<Route> {
  // 전체 leg = drive[0] + (access-out+back)[0] + drive[1] + ... + drive[last]
  const legs: Leg[] = []
  for (let i = 0; i < driveLegs.length; i++) {
    legs.push(driveLegs[i])
    if (i < access.length) legs.push(...access[i].legs)
  }

  // 타임라인: 경유지 방문 = 도착(주차)+접근왕복+체류. 단순화를 위해
  // 각 경유지의 "체류 블록"을 접근 왕복시간 + 체류시간으로 계산한다.
  const legDurationsSec = driveLegs.map((l) => l.durationSec)
  const dwellMinutes = input.ordered.map((o, i) => {
    const accessSec = access[i].legs.reduce((s, l) => s + l.durationSec, 0)
    return o.waypoint.dwellMin + Math.round(accessSec / 60)
  })
  const timeline = buildTimeline({
    departAt: input.departAt,
    legDurationsSec,
    dwellMinutes,
  })

  const stops: Stop[] = []
  for (let i = 0; i < input.ordered.length; i++) {
    const o = input.ordered[i]
    const t = timeline.stops[i]
    const level = input.congestionLevelAt
      ? await input.congestionLevelAt(o.waypoint.location, new Date(t.arriveAt))
      : null
    stops.push({
      waypointId: o.waypoint.id,
      arriveAt: t.arriveAt,
      departAt: t.departAt,
      parkingLotId: o.parkingLotId,
      parkingFee: o.parkingFee,
      accessMode: access[i].mode,
      congestion: { level },
    })
  }

  // 주차비: 정보 있는 것만 합산, 하나라도 없으면 parkingCostPartial=true
  const knownFees = input.ordered
    .map((o) => o.parkingFee)
    .filter((f): f is number => f !== null)
  const parkingCostPartial = knownFees.length < input.ordered.length
  const parkingCost = knownFees.reduce((s, f) => s + f, 0)

  const totals = sumTotals(legs, { parkingCostPartial })
  // 주차비는 Leg.cost 에 없으므로 별도로 더한다 (교통비/통행료 + 주차비)
  totals.cost += parkingCost
  totals.fatigue = computeFatigue({
    walkDistanceM: totals.walkDistanceM,
    transfers: totals.transfers,
    standingMin: 0,
    congestedDriveMin: 0,
  })

  const destLevel = input.congestionLevelAt
    ? await input.congestionLevelAt(
        input.destination,
        new Date(timeline.finalArriveAt),
      )
    : null
  const scored = scoreRoute({
    scenario,
    durationSec: totals.durationSec,
    cost: totals.cost,
    fatigue: totals.fatigue,
    congestionLevel: destLevel,
    preference: input.preference,
  })

  const reasons = [...scored.reasons]
  if (parkingCostPartial) reasons.push('주차비 일부 정보 없음')

  return {
    scenario,
    legs,
    stops,
    totals,
    score: scored.score,
    reasons,
  }
}
