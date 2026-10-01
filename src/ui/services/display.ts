import type { Route, TransitStep } from '@shared/types'
import { CONGEST_LEVELS } from '@shared/config'
import {
  departureIso,
  type JourneyDraft,
  type ParkingSelections,
} from './journey'
import { placeById } from './catalog'

export const won = (value: number) => `${value.toLocaleString('ko-KR')}원`
export const minutes = (seconds: number) => `${Math.ceil(seconds / 60)}분`
export const meters = (m: number) =>
  m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`
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
  'park-transit': '자차 주차 후 대중교통',
}

/** 대중교통 구간 상세를 사람이 읽는 한 줄로 (예: "2호선 강남 → 역삼 · 6정거장") */
export function describeTransitStep(step: TransitStep): string {
  if (step.type === 'walk') return `도보 ${minutes(step.minutes * 60)}`
  const kind = step.type === 'subway' ? '지하철' : '버스'
  const label = step.line ? `${step.line}` : kind
  const ride =
    step.from && step.to ? `${step.from} → ${step.to}` : (step.from ?? '')
  const stations =
    step.stationCount && step.stationCount > 0
      ? ` · ${step.stationCount}정거장`
      : ''
  return `${label} ${ride}${stations}`.trim()
}

export type VisitDisplay = {
  name: string
  arriveAt: string
  departAt: string
  dwellMin: number
  congestion: string
  /** 이 도착지에 접근한 수단 (도보/대중교통). transit-only 는 항상 transit */
  accessMode?: 'walk' | 'transit'
  /** 선택한 주차장 이름. 없으면 null (주차 정보 없음) */
  parkingName: string | null
  /** 주차 요금(원). null = 정보 없음 */
  parkingFee: number | null
  /** 이 도착지까지 이동한 구간의 도보 거리(m) */
  accessWalkM: number
  /** 이 도착지까지 대중교통 구간 상세 (있으면) */
  transitSteps: TransitStep[]
}

export type TimelineDisplay = {
  visits: VisitDisplay[]
  finalArriveAt: string
  /** 종점(마지막 도착지)까지의 대중교통 구간 상세 (transit-only 에서 채워짐) */
  endpointSteps: TransitStep[]
}

/**
 * A의 자차 Stop 시각은 주차장 기준이므로 방문지 표시 시각을 Leg와 체류시간으로 누적한다.
 * 동시에 각 방문지의 접근수단·주차·대중교통 상세를 화면 표시용으로 모아준다.
 * selections 를 넘기면 선택한 주차장 이름을 함께 채운다 (없으면 이름 null).
 */
export function displayTimeline(
  route: Route,
  draft: JourneyDraft,
  selections?: ParkingSelections,
): TimelineDisplay {
  let cursor = Date.parse(departureIso(draft))
  const visits: VisitDisplay[] = []
  const isTransitOnly = route.scenario === 'transit-only'
  const isParkTransit = route.scenario === 'park-transit'
  let index = 0
  // 방문지 사이 구간의 대중교통 상세를 모은다. transit-only 는 leg 자체가 구간,
  // 자차/혼합은 access-out leg 이 "주차장→도착지" 접근 구간이다.
  let pendingSteps: TransitStep[] = []
  let pendingWalkM = 0

  for (const leg of route.legs) {
    cursor += leg.durationSec * 1000
    // 이번 leg 이 어느 방문지에 "도착"시키는 구간이면 방문지를 확정한다.
    // park-transit 는 자차 drive leg 이 주차지(A)에 도착시키는 구간이다.
    const arrivesAtVisit =
      isTransitOnly ||
      leg.role === 'access-out' ||
      (isParkTransit && leg.role === 'drive')
    if (arrivesAtVisit) {
      pendingSteps = leg.transitDetail ?? []
      pendingWalkM = leg.walkDistanceM
    }
    if (arrivesAtVisit && index < route.stops.length) {
      const stop = route.stops[index++]
      const waypoint = draft.waypoints.find((w) => w.id === stop.waypointId)!
      const arriveAt = new Date(cursor).toISOString()
      cursor += waypoint.dwellMin * 60_000
      const lot = selections?.[stop.waypointId]
      visits.push({
        name: placeById(waypoint.placeId).name,
        arriveAt,
        departAt: new Date(cursor).toISOString(),
        dwellMin: waypoint.dwellMin,
        congestion: congestion(stop.congestion.level),
        accessMode: stop.accessMode,
        // sentinel(주차장 없이 진행)은 id 가 빈 문자열이라 이름 없음으로 취급
        parkingName: lot && lot.id ? lot.name : null,
        parkingFee: stop.parkingFee,
        accessWalkM: pendingWalkM,
        transitSteps: pendingSteps,
      })
      pendingSteps = []
      pendingWalkM = 0
    }
  }

  // 마지막 leg(=종점 도착 구간)의 대중교통 상세를 endpointSteps 로 남긴다.
  // transit-only 는 마지막 대중교통 구간, park-transit 는 A→B 대중교통 구간.
  const endpointSteps =
    (isTransitOnly || isParkTransit) && route.legs.length
      ? (route.legs[route.legs.length - 1].transitDetail ?? [])
      : []

  return {
    visits,
    finalArriveAt: new Date(cursor).toISOString(),
    endpointSteps,
  }
}
