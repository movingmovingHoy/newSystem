import type { LatLng, Leg, Route, Stop, Waypoint } from '@shared/types'
import type { RouteProvider } from '../providers'
import { computeFatigue } from '../scoring/fatigue'
import { scoreRoute } from '../scoring/scoring'
import { buildTimeline } from '../timeline/timeline'
import { sumCongestedDriveMin, sumTotals } from './totals'
import type { Preference } from '@shared/config'

/**
 * 자차 경로(car-direct). AGENTS.md 8장.
 * 차는 출발지 → 경유지별 주차장 → 도착지 로 이동(drive legs).
 * 각 경유지는 주차장에서 걸어서 왕복한다 (접근은 항상 도보).
 */

/** 경유지 + 선택된 주차장 */
export type WaypointParking = {
  waypoint: Waypoint
  parkingLotId: string
  parkingLocation: LatLng
  /** null = 요금 정보 없음 (AGENTS.md 10장) */
  parkingFee: number | null
}

export type CarRouteInput = {
  origin: LatLng
  destination: LatLng
  /** 방문 순서대로 정렬된 경유지 + 주차장 선택 */
  ordered: WaypointParking[]
  departAt: string
  preference: Preference
  congestionLevelAt?: (loc: LatLng, arriveAt: Date) => Promise<number | null>
}

/** 주차장↔경유지 도보 왕복 (access-out + access-back) */
type Access = { legs: Leg[]; mode: 'walk' }

async function walkLeg(
  walk: RouteProvider,
  from: LatLng,
  to: LatLng,
  role: Leg['role'],
): Promise<Leg> {
  const [leg] = await walk.route({ from, to })
  return { ...leg, role }
}

async function computeAccess(
  walk: RouteProvider,
  parking: LatLng,
  waypoint: LatLng,
): Promise<Access> {
  const out = await walkLeg(walk, parking, waypoint, 'access-out')
  const back = await walkLeg(walk, waypoint, parking, 'access-back')
  return { legs: [out, back], mode: 'walk' }
}

export async function buildCarRoute(
  providers: { car: RouteProvider; walk: RouteProvider },
  input: CarRouteInput,
): Promise<Route> {
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

  const access: Access[] = []
  for (const o of ordered) {
    access.push(
      await computeAccess(
        providers.walk,
        o.parkingLocation,
        o.waypoint.location,
      ),
    )
  }

  return assembleRoute(input, driveLegs, access)
}
async function assembleRoute(
  input: CarRouteInput,
  driveLegs: Leg[],
  access: Access[],
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
    congestedDriveMin: sumCongestedDriveMin(legs),
  })

  const destLevel = input.congestionLevelAt
    ? await input.congestionLevelAt(
        input.destination,
        new Date(timeline.finalArriveAt),
      )
    : null
  const scored = scoreRoute({
    scenario: 'car-direct',
    durationSec: totals.durationSec,
    cost: totals.cost,
    fatigue: totals.fatigue,
    congestionLevel: destLevel,
    preference: input.preference,
  })

  const reasons = [...scored.reasons]
  if (parkingCostPartial) reasons.push('주차비 일부 정보 없음')

  return {
    scenario: 'car-direct',
    legs,
    stops,
    totals,
    score: scored.score,
    reasons,
  }
}
