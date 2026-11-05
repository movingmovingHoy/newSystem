import type { Route, TransitStep } from '@shared/types'
import { CONGEST_LEVELS, PARKING_PRESSURE_THRESHOLD } from '@shared/config'
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

/** 목적지 주변 주차 포화 표시용 값. 포화율 수준(색)은 CSS 토큰이 정한다. */
export type ParkingPressureView = {
  /** 목적지 주변 포화율 0~100 */
  percent: number
  /** 압박점수. 첫 도착지도 포화여서 추천을 뺀 경우처럼 문구에 없으면 percent 를 쓴다 */
  score: number
  recommended: boolean
  /** low <50, mid 50~(추천 기준-1), high >=추천 기준(70) (포화율 기준) */
  level: 'low' | 'mid' | 'high'
  /** 첫 도착지도 포화여서 추천을 뺀 경우 그 포화율, 아니면 null */
  firstPercent: number | null
  /** 첫 도착지 주변 실시간 정보가 없는 경우 */
  firstUnknown: boolean
}

/**
 * 임시: Route 에 구조화 필드가 없어 근거 문구(reasons)에서 포화율을 읽는다.
 * 문구는 routing/scoring/parking-pressure.ts 의 parkingPressureReasons 가 만든다.
 * 문구를 바꾸면 pressure-view.test.ts 가 실제 생성 함수로 검증해 깨짐을 알려준다.
 * 나중에 Route 에 선택 필드를 추가하면 이 파싱은 없앤다.
 */
export function parkingPressureView(route: Route): ParkingPressureView | null {
  if (route.scenario !== 'park-transit') return null
  const text = route.reasons.join('\n')
  const percentMatch = /목적지 주변 주차 포화 (\d+)%/.exec(text)
  if (!percentMatch) return null
  const percent = Number(percentMatch[1])
  const scoreMatch = /주차 혼잡 점수 (\d+)점/.exec(text)
  const firstMatch = /첫 도착지 주변 주차도 포화 (\d+)%/.exec(text)
  return {
    percent,
    score: scoreMatch ? Number(scoreMatch[1]) : percent,
    recommended: text.includes('주차 후 대중교통 추천'),
    // 포화율만으로도 추천 기준에 닿는 구간(70% 이상)을 가장 진한 색으로 보여준다.
    level:
      percent >= PARKING_PRESSURE_THRESHOLD
        ? 'high'
        : percent >= 50
          ? 'mid'
          : 'low',
    firstPercent: firstMatch ? Number(firstMatch[1]) : null,
    firstUnknown: text.includes('첫 도착지 주변 주차 정보 없음'),
  }
}
