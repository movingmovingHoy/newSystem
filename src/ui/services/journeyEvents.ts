import type { Route, TransitStep } from '@shared/types'
import { congestion } from './display'
import {
  departureIso,
  type JourneyDraft,
  type ParkingSelections,
} from './journey'
import { placeById } from './catalog'

/**
 * 자차 계열 경로(car-direct, park-transit)를 "이동 순서대로" 풀어 쓴 목록.
 * 화면은 이 목록을 위에서 아래로 그리기만 한다.
 *
 *  car-direct   : 출발 → 차 이동 → 주차 → 도보(가기) → 체류 → 도보(돌아오기) → 차 이동 → 도착
 *  park-transit : 출발 → 차 이동 → 주차 → 체류 → 대중교통 → 도착
 *
 * `at` 은 그 이벤트가 시작(도착)하는 시각이다. 대중교통만 경로는 TransitJourney 가
 * 따로 그리므로 빈 목록을 돌려준다.
 */
export type JourneyEvent =
  | { kind: 'start'; at: string; name: string }
  | {
      kind: 'drive'
      at: string
      to: string
      durationSec: number
      /** 정체 구간 소요시간(초). 없으면 0 */
      congestedSec: number
    }
  /** 주차장 도착. name=null 이면 주차장 정보 없음 */
  | { kind: 'park'; at: string; name: string | null; fee: number | null }
  | {
      kind: 'walk'
      at: string
      direction: 'out' | 'back'
      to: string
      durationSec: number
      distanceM: number
    }
  | {
      kind: 'stay'
      at: string
      departAt: string
      name: string
      dwellMin: number
      congestion: string
    }
  | {
      kind: 'transit'
      at: string
      to: string
      durationSec: number
      steps: TransitStep[]
    }
  | { kind: 'end'; at: string; name: string }

export function journeyEvents(
  route: Route,
  draft: JourneyDraft,
  selections?: ParkingSelections,
): JourneyEvent[] {
  if (route.scenario === 'transit-only') return []

  const isParkTransit = route.scenario === 'park-transit'
  const iso = (ms: number) => new Date(ms).toISOString()
  const nameOf = (id: string) =>
    placeById(draft.waypoints.find((w) => w.id === id)!.placeId).name
  const stopIds = new Set(route.stops.map((s) => s.waypointId))
  // 경유 stop 에 없는 도착지가 종점이다 (plan.ts: 마지막 도착지는 stop 으로 들어가지 않는다)
  const endpoint = draft.waypoints.find((w) => !stopIds.has(w.id))
  const endpointName = endpoint ? nameOf(endpoint.id) : ''

  let cursor = Date.parse(departureIso(draft))
  const events: JourneyEvent[] = [
    { kind: 'start', at: iso(cursor), name: placeById(draft.originId).name },
  ]
  let index = 0 // 다음에 방문할 stop

  const pushStay = () => {
    const stop = route.stops[index]
    const waypoint = draft.waypoints.find((w) => w.id === stop.waypointId)!
    const arrive = cursor
    cursor += waypoint.dwellMin * 60_000
    events.push({
      kind: 'stay',
      at: iso(arrive),
      departAt: iso(cursor),
      name: nameOf(stop.waypointId),
      dwellMin: waypoint.dwellMin,
      congestion: congestion(stop.congestion.level),
    })
  }

  for (const leg of route.legs) {
    const at = iso(cursor)
    cursor += leg.durationSec * 1000
    const stop = route.stops[index] as Route['stops'][number] | undefined

    if (leg.role === 'drive') {
      if (!stop) {
        // 마지막 차 이동: 종점 도착
        events.push({
          kind: 'drive',
          at,
          to: endpointName,
          durationSec: leg.durationSec,
          congestedSec: leg.congestedDriveSec ?? 0,
        })
        continue
      }
      const lot = selections?.[stop.waypointId]
      const lotName = lot && lot.id ? lot.name : null
      events.push({
        kind: 'drive',
        at,
        to: isParkTransit
          ? nameOf(stop.waypointId)
          : (lotName ?? `${nameOf(stop.waypointId)} 인근 주차장`),
        durationSec: leg.durationSec,
        congestedSec: leg.congestedDriveSec ?? 0,
      })
      events.push({
        kind: 'park',
        at: iso(cursor),
        // park-transit 는 실제 주차장을 아직 반영하지 않는다 (AGENTS.md 8-1)
        name: isParkTransit ? null : lotName,
        fee: stop.parkingFee,
      })
      if (isParkTransit) {
        pushStay()
        index++
      }
    } else if (leg.role === 'access-out') {
      events.push({
        kind: 'walk',
        at,
        direction: 'out',
        to: nameOf(stop!.waypointId),
        durationSec: leg.durationSec,
        distanceM: leg.walkDistanceM,
      })
      pushStay()
    } else if (leg.role === 'access-back') {
      const lot = selections?.[stop!.waypointId]
      events.push({
        kind: 'walk',
        at,
        direction: 'back',
        to: lot && lot.id ? lot.name : '주차장',
        durationSec: leg.durationSec,
        distanceM: leg.walkDistanceM,
      })
      index++
    } else {
      // park-transit: 첫 도착지 → 종점 대중교통 구간
      events.push({
        kind: 'transit',
        at,
        to: endpointName,
        durationSec: leg.durationSec,
        steps: leg.transitDetail ?? [],
      })
    }
  }

  events.push({ kind: 'end', at: iso(cursor), name: endpointName })
  return events
}
