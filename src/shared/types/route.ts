import type { LatLng } from './geo'

export type Mode = 'car' | 'walk' | 'subway' | 'bus'

/**
 * 대중교통 경로의 구간 상세 (요약형 Leg에 표시용으로 부가). 선택적.
 * 예: "지하철 2호선 강남 → 역삼", "도보 5분", "간선버스 143 …".
 * 계산(시간/요금/점수)에는 쓰이지 않고 화면 안내용이다.
 */
export type TransitStep = {
  type: 'walk' | 'subway' | 'bus'
  /** 지하철 노선명 또는 버스 번호 (도보는 없음) */
  line?: string
  /** 승차 정류장/역 (도보는 없음) */
  from?: string
  /** 하차 정류장/역 (도보는 없음) */
  to?: string
  /** 구간 소요시간(분) */
  minutes: number
  /** 구간 이동거리(m) */
  distanceM: number
  /** 정차 정거장 수 (지하철/버스) */
  stationCount?: number
}

export type Leg = {
  mode: Mode
  /** 혼합 경로의 주차장↔경유지 왕복 구분 */
  role?: 'drive' | 'access-out' | 'access-back'
  from: LatLng
  to: LatLng
  /** ISO 8601 */
  departAt: string
  arriveAt: string
  durationSec: number
  /** 교통비, 통행료 (주차비 제외) */
  cost: number
  walkDistanceM: number
  transfers: number
  /** 0~100 */
  fatigue: number
  /** 대중교통 구간 상세 (표시용, 선택적). 계산에는 쓰지 않는다. */
  transitDetail?: TransitStep[]
  /** 지도에 그릴 경로 좌표(폴리라인). 표시용, 선택적. 자차는 실제 도로 좌표. */
  path?: LatLng[]
  /**
   * 자차 구간 중 정체로 보는 도로의 소요시간 합(초). 선택적.
   * 카카오 도로별 traffic_state(정체/지체/서행)에 반영 비율을 곱해 합산한다.
   * 없으면 정체 정보 없음(0으로 취급). 피로도의 "운전 정체시간" 입력으로 쓴다.
   */
  congestedDriveSec?: number
}

export type Scenario = 'car-direct' | 'mixed' | 'transit-only' | 'park-transit'

/**
 * 경로 합계. AGENTS.md 10장: 요금 정보 없는 주차장이 섞이면
 * parkingCostPartial=true 로 두고 화면에 "주차비 일부 정보 없음" 표시.
 */
export type Totals = {
  durationSec: number
  /** 교통비 + 통행료 + 확정된 주차비 (정보 없는 주차비는 제외) */
  cost: number
  walkDistanceM: number
  transfers: number
  fatigue: number
  parkingCostPartial: boolean
}

export type Route = {
  scenario: Scenario
  legs: Leg[]
  stops: Stop[]
  totals: Totals
  /** 낮을수록 좋음 */
  score: number
  reasons: string[]
}

/** null = 정보 없음 (121곳 밖이거나 예측 범위 밖) */
export type PlaceCongestion = {
  level: number | null
  areaCode?: string
}

export type Stop = {
  waypointId: string
  arriveAt: string
  departAt: string
  parkingLotId?: string
  /** null = 정보 없음 */
  parkingFee: number | null
  accessMode?: 'walk' | 'transit'
  congestion: PlaceCongestion
}
