import type { LatLng } from './geo'

export type Mode = 'car' | 'walk' | 'subway' | 'bus'

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
}

export type Scenario = 'car-direct' | 'mixed' | 'transit-only'

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
