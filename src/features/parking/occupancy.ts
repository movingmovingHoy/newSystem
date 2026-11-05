import type { LatLng } from '@shared/types'
import { REALTIME_PARKING_MAX_AGE_MIN } from '@shared/config'
import { distanceM } from './providers/geo'

/**
 * 실시간 주차 포화율 집계. AGENTS.md 8-2.
 * 서울시 실시간 주차(총 주차면, 현재 주차 대수, 갱신 시각)를 반경 내에서 합산한다.
 * 정보가 없으면 null 을 돌려준다. 0%로 치지 않는다.
 */

export type LiveParkingLot = {
  /** 주차장 id (예: seoul:{PKLT_CD}) */
  id: string
  location: LatLng
  /** 총 주차면 */
  capacity: number
  /** 현재 주차 대수 */
  current: number
  /** 갱신 시각 (ISO 8601) */
  updatedAt: string
}

export type Occupancy = {
  /** 포화율 0~1 (현재 대수 합 ÷ 총 주차면 합) */
  ratio: number
  /** 집계에 쓴 주차장 수 */
  lotCount: number
  /** 집계에 쓴 총 주차면 합 */
  capacity: number
}

/**
 * 중심에서 radiusM 안의 실시간 주차장을 합계 기준으로 집계한다.
 * 다음은 집계에서 뺀다: 반경 밖, 갱신 시각이 maxAgeMin 보다 오래됨,
 * 총 주차면이 0 이하/비정상, 현재 대수가 음수/비정상, 갱신 시각 파싱 불가.
 * 한 곳도 남지 않으면 null (정보 없음).
 */
export function aggregateOccupancy(
  lots: LiveParkingLot[],
  center: LatLng,
  radiusM: number,
  now: Date,
  maxAgeMin: number = REALTIME_PARKING_MAX_AGE_MIN,
): Occupancy | null {
  let capacity = 0
  let current = 0
  let lotCount = 0
  for (const lot of lots) {
    if (!Number.isFinite(lot.capacity) || lot.capacity <= 0) continue
    if (!Number.isFinite(lot.current) || lot.current < 0) continue
    const updated = Date.parse(lot.updatedAt)
    if (!Number.isFinite(updated)) continue
    if (now.getTime() - updated > maxAgeMin * 60_000) continue
    const distance = distanceM(center, lot.location)
    if (!Number.isFinite(distance) || distance > radiusM) continue
    capacity += lot.capacity
    current += lot.current
    lotCount++
  }
  if (lotCount === 0) return null
  return { ratio: Math.min(1, current / capacity), lotCount, capacity }
}
