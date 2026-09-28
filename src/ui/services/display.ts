import type { Route } from '@shared/types'
import { CONGEST_LEVELS } from '@shared/config'
import { departureIso, type JourneyDraft } from './journey'
import { placeById } from './catalog'

export const won = (value: number) => `${value.toLocaleString('ko-KR')}원`
export const minutes = (seconds: number) => `${Math.ceil(seconds / 60)}분`
export const time = (iso: string) =>
  new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
export const congestion = (level: number | null) =>
  `혼잡: ${level === null ? '정보 없음' : (CONGEST_LEVELS[level] ?? '정보 없음')}`
export const scenarioNames = {
  'car-direct': '자차 + 도보',
  mixed: '자차 + 대중교통 혼합',
  'transit-only': '대중교통',
}

/** A의 자차 Stop 시각은 주차장 기준이므로 방문지 표시 시각을 Leg와 체류시간으로 누적한다. */
export function displayTimeline(route: Route, draft: JourneyDraft) {
  let cursor = Date.parse(departureIso(draft))
  const visits: {
    name: string
    arriveAt: string
    departAt: string
    dwellMin: number
    congestion: string
  }[] = []
  let index = 0
  for (const leg of route.legs) {
    cursor += leg.durationSec * 1000
    if (
      (route.scenario === 'transit-only' || leg.role === 'access-out') &&
      index < route.stops.length
    ) {
      const stop = route.stops[index++]
      const waypoint = draft.waypoints.find((w) => w.id === stop.waypointId)!
      const arriveAt = new Date(cursor).toISOString()
      cursor += waypoint.dwellMin * 60_000
      visits.push({
        name: placeById(waypoint.placeId).name,
        arriveAt,
        departAt: new Date(cursor).toISOString(),
        dwellMin: waypoint.dwellMin,
        congestion: congestion(stop.congestion.level),
      })
    }
  }
  return { visits, finalArriveAt: new Date(cursor).toISOString() }
}
