import type { LatLng, Leg, Route, Stop, Waypoint } from '@shared/types'
import type { RouteProvider } from '../providers'
import { computeFatigue } from '../scoring/fatigue'
import { scoreRoute } from '../scoring/scoring'
import { buildTimeline } from '../timeline/timeline'
import { sumTotals } from './totals'
import type { Preference } from '@shared/config'
import { TRANSFER_WINDOW_MIN } from '@shared/config'

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

  // 각 구간을 순차로 조회한다. 뒤 구간은 앞 구간의 이동+체류를 누적한
  // "실제 타는 시각"을 출발 시각으로 넘겨 그 시각대의 대중교통 결과를 얻는다
  // (AGENTS.md 9장의 누적 시각 반영, MVP 이후). ODsay는 출발 시각을 반영한다.
  const legs: Leg[] = []
  let cursor = departAt // 현재 구간을 타는 시각 (ISO)
  for (let i = 0; i < points.length - 1; i++) {
    const segment = await transit.route({
      from: points[i],
      to: points[i + 1],
      departAt: cursor,
    })
    legs.push(...segment)

    // 다음 구간 조회 시각 = 이 구간 이동시간 + (경유지면) 체류시간 누적
    const segSec = segment.reduce((s, l) => s + l.durationSec, 0)
    const dwellMin = orderedWaypoints[i]?.dwellMin ?? 0
    cursor = new Date(
      new Date(cursor).getTime() + (segSec + dwellMin * 60) * 1000,
    ).toISOString()
  }

  // 서울시 환승요금 규칙 적용 (AGENTS.md 8·13장).
  // leg[i](i>0)는 경유지[i-1]에서 내렸다 다시 타는 구간이다.
  // 그 경유지 체류가 환승 기준시간(TRANSFER_WINDOW_MIN) 이내면 환승으로 보고
  // 기본요금을 다시 부과하지 않는다(cost=0). 초과하면 새 승차라 요금 유지.
  // (구간별 거리 추가요금은 계산하지 않는다 — 환승 여부만 판단)
  for (let i = 1; i < legs.length; i++) {
    const dwellMin = orderedWaypoints[i - 1]?.dwellMin ?? 0
    if (dwellMin <= TRANSFER_WINDOW_MIN) {
      legs[i] = { ...legs[i], cost: 0 }
    }
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
