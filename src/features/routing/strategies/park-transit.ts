import type { Leg, Route, Stop, Waypoint } from '@shared/types'
import type { RouteProvider } from '../providers'
import { computeFatigue } from '../scoring/fatigue'
import { scoreRoute } from '../scoring/scoring'
import { buildTimeline } from '../timeline/timeline'
import { sumTotals } from './totals'
import type { Preference } from '@shared/config'

/**
 * 주차 후 대중교통 전환(park-transit) 경로. AGENTS.md 8-1.
 * 출발지 → 도착지A 는 자차(여기 주차), 도착지A → 도착지B 는 대중교통.
 * "차량 유지형"(car-direct/mixed)과 달리 차를 A에 두고 B로 간다.
 *
 * 적용 조건(출발 1 + 도착 2개)과 두 방향(A→B, B→A) 비교는 상위(plan.ts)에서
 * 처리한다. 이 함수는 "주차지 parkAt → 목적지 destination" 한 방향만 만든다.
 *
 * 주차 실데이터(요금)는 MVP 미연동이라 주차비는 정보 없음으로 둔다
 * (parkingCostPartial=true, stop.parkingFee=null).
 */

export type ParkTransitInput = {
  origin: Waypoint['location']
  /** 차로 가서 주차하는 도착지 */
  parkAt: Waypoint
  /** 주차 후 대중교통으로 가는 최종 도착지 */
  destination: Waypoint
  /** 출발 시각 (ISO) */
  departAt: string
  preference: Preference
  congestionLevelAt?: (
    loc: Waypoint['location'],
    arriveAt: Date,
  ) => Promise<number | null>
}

export async function buildParkTransitRoute(
  providers: { car: RouteProvider; transit: RouteProvider },
  input: ParkTransitInput,
): Promise<Route> {
  const { origin, parkAt, destination, departAt } = input

  // 1구간: 출발 → A (자차). A에 주차한다.
  const [carLeg] = await providers.car.route({
    from: origin,
    to: parkAt.location,
    departAt,
  })
  const driveLeg: Leg = { ...carLeg, role: 'drive' }

  // A 도착 시각 + 체류시간 누적 = 대중교통 구간을 타는 시각
  const transitDepartAt = new Date(
    new Date(departAt).getTime() +
      (driveLeg.durationSec + parkAt.dwellMin * 60) * 1000,
  ).toISOString()

  // 2구간: A → B (대중교통)
  const transitLegs = await providers.transit.route({
    from: parkAt.location,
    to: destination.location,
    departAt: transitDepartAt,
  })

  const legs: Leg[] = [driveLeg, ...transitLegs]

  // 타임라인: 중간 정차는 A 하나. 구간 수 = 2 = 정차 1 + 1.
  const transitSec = transitLegs.reduce((s, l) => s + l.durationSec, 0)
  const timeline = buildTimeline({
    departAt,
    legDurationsSec: [driveLeg.durationSec, transitSec],
    dwellMinutes: [parkAt.dwellMin],
  })

  const aLevel = input.congestionLevelAt
    ? await input.congestionLevelAt(
        parkAt.location,
        new Date(timeline.stops[0].arriveAt),
      )
    : null

  const stops: Stop[] = [
    {
      waypointId: parkAt.id,
      arriveAt: timeline.stops[0].arriveAt,
      departAt: timeline.stops[0].departAt,
      // 주차 실데이터 미연동: 요금 정보 없음 (AGENTS.md 8-1, 10장)
      parkingFee: null,
      accessMode: 'transit',
      congestion: { level: aLevel },
    },
  ]

  // 주차비는 정보 없음 → parkingCostPartial=true. cost 는 교통비/통행료만.
  const totals = sumTotals(legs, { parkingCostPartial: true })
  totals.fatigue = computeFatigue({
    walkDistanceM: totals.walkDistanceM,
    transfers: totals.transfers,
    standingMin: 0,
    congestedDriveMin: 0,
  })

  const destLevel = input.congestionLevelAt
    ? await input.congestionLevelAt(
        destination.location,
        new Date(timeline.finalArriveAt),
      )
    : null
  const scored = scoreRoute({
    scenario: 'park-transit',
    durationSec: totals.durationSec,
    cost: totals.cost,
    fatigue: totals.fatigue,
    congestionLevel: destLevel,
    preference: input.preference,
  })

  const reasons = [...scored.reasons, '주차비 일부 정보 없음']

  return {
    scenario: 'park-transit',
    legs,
    stops,
    totals,
    score: scored.score,
    reasons,
  }
}
