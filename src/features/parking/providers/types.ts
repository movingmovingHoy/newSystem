import type { LatLng, ParkingLot } from '@shared/types'

/**
 * 주차 provider 인터페이스. AGENTS.md 10장.
 * 데이터 소스: 한국교통안전공단 주차정보 API. 시설정보는 배치로 DB 적재 후
 * 반경 검색은 DB에서 한다. 실시간 잔여석은 인터페이스만 열어두고 MVP에서는
 * 항상 "정보 없음"을 반환한다.
 */

export type ParkingSearch = {
  center: LatLng
  radiusM: number
}

/** 실시간 잔여석. MVP에서는 항상 unknown. */
export type Availability = { status: 'unknown' }

export interface ParkingProvider {
  /** 반경 내 주차장 검색 (DB 기반). */
  search(query: ParkingSearch): Promise<ParkingLot[]>
  /** 실시간 잔여석. MVP에서는 항상 { status: 'unknown' }. */
  getAvailability(lotId: string): Promise<Availability>
}
