import type { LatLng } from './geo'

/**
 * 주차 요금 정보. AGENTS.md 10장: 운영정보(요금)가 있는 주차장만 채우고,
 * 없으면 ParkingLot.fee = null 로 둔다.
 */
export type FeeInfo = {
  /** 기본 요금 (원) */
  baseFee: number
  /** 기본 제공 시간 (분) */
  baseTimeMin: number
  /** 추가 요금 (원) */
  addFee: number
  /** 추가 요금 단위 시간 (분) */
  addTimeMin: number
  /** 일 최대 요금 (원). 없으면 undefined */
  dailyMaxFee?: number
}

export type ParkingLot = {
  /** 주차장 관리번호 */
  id: string
  name: string
  location: LatLng
  /** null = 요금 정보 없음 */
  fee: FeeInfo | null
  distanceToWaypointM: number
  /** MVP에서는 항상 없음 (실시간 잔여석 미제공) */
  availability?: undefined
}
