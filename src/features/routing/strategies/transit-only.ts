import type { LatLng, Leg, Route, Stop, Waypoint } from '@shared/types'
import type { RouteProvider } from '../providers'
import { computeFatigue } from '../scoring/fatigue'
import { scoreRoute } from '../scoring/scoring'
import { buildTimeline } from '../timeline/timeline'
import { sumTotals } from './totals'
import type { Preference } from '@shared/config'

/**
 * 전 구간 대중교통(transit-only) 경로. AGENTS.md 8장.
 * 출발지 → 경유지들(방문 순서대로) → 도착지 를 대중교통 provider로 이어 붙인다.
 * 각 구간은 하나의 대중교통 Leg (요약형)로 표현된다.
 */

export type TransitOnlyInput = {
  origin: LatLng
  destination: LatLng
  /** 방문 순서대로 정렬된 경유지 */
  orderedWaypoints: Waypoint[]
  /** 출발 시각 (ISO) */
  departAt: string
  preference: Preference
  /** 도착지/경유지 혼잡 단계 조회 (있으면 사용, 없으면 null 취급) */
  congestionLevelAt?: (loc: LatLng, arriveAt: Date) => Promise<number | null>
}

async function congestionOf(
  input: TransitOnlyInput,
  loc: LatLng,
  arriveAtIso: string,
): Promise<number | null> {
  if (!input.congestionLevelAt) return null
  return input.congestionLevelAt(loc, new Date(arriveAtIso))
}

export async function buildTransitOnlyRoute(
  transit: RouteProvider,
  input: TransitOnlyInput,
): Promise<Route> {
  const { origin, destination, orderedWaypoints, departAt } = input

  // 방문 지점 순서: 출발 → 경유지들 → 도착
  const points: LatLng[] = [
    origin,
    ...orderedWaypoints.map((w) => w.location),
    destination,
  ]

  // 각 구간을 대중교통으로 이어 붙인다. 시각은 timeline 으로 다시 누적하므로
  // 여기서는 소요시간/거리 등 Leg 속성만 필요하다.
  const legs: Leg[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const segment = await transit.route({
      from: points[i],
      to: points[i + 1],
      departAt,
    })
    legs.push(...segment)
  }

  // 구간별 소요시간으로 타임라인 재계산 (출발 시각 + 이동 + 체류 누적)
  const legDurationsSec = legs.map((l) => l.durationSec)
  const dwellMinutes = orderedWaypoints.map((w) => w.dwellMin)
  const timeline = buildTimeline({ departAt, legDurationsSec, dwellMinutes })

  // Stop[] 구성 (경유지별 도착/출발 시각 + 혼잡도)
  const stops: Stop[] = []
  for (let i = 0; i < orderedWaypoints.length; i++) {
    const w = orderedWaypoints[i]
    const t = timeline.stops[i]
    const level = await congestionOf(input, w.location, t.arriveAt)
    stops.push({
      waypointId: w.id,
      arriveAt: t.arriveAt,
      departAt: t.departAt,
      parkingFee: null,
      accessMode: 'transit',
      congestion: { level },
    })
  }

  const totals = sumTotals(legs)
  totals.fatigue = computeFatigue({
    walkDistanceM: totals.walkDistanceM,
    transfers: totals.transfers,
    standingMin: 0,
    congestedDriveMin: 0,
  })

  // 도착지 혼잡으로 점수 산정
  const destLevel = await congestionOf(
    input,
    destination,
    timeline.finalArriveAt,
  )
  const scored = scoreRoute({
    scenario: 'transit-only',
    durationSec: totals.durationSec,
    cost: totals.cost,
    fatigue: totals.fatigue,
    congestionLevel: destLevel,
    preference: input.preference,
  })

  return {
    scenario: 'transit-only',
    legs,
    stops,
    totals,
    score: scored.score,
    reasons: scored.reasons,
  }
}
