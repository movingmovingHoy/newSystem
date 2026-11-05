import type { LatLng } from '@shared/types'
import { PARKING_PRESSURE_RADIUS_M } from '@shared/config'
import { aggregateOccupancy, type Occupancy } from '../occupancy'
import { searchBounds } from './geo'

/**
 * 브라우저 전용. 인증키 없이 같은 출처의 로컬 서버(/api/parking/live)에 요청한다.
 * 서버가 좌표를 붙여 준 반경 내 실시간 주차장을 합계 포화율로 집계한다. AGENTS.md 8-2.
 * 정보가 없으면 null, 조회 실패는 던진다 (실패와 "정보 없음"을 구분한다).
 */
export class HttpLiveParkingProvider {
  async occupancy(
    center: LatLng,
    radiusM: number = PARKING_PRESSURE_RADIUS_M,
    now: Date = new Date(),
  ): Promise<Occupancy | null> {
    searchBounds({ center, radiusM })
    const params = new URLSearchParams({
      lat: String(center.lat),
      lng: String(center.lng),
      radiusM: String(radiusM),
    })
    let response: Response
    try {
      response = await fetch(`/api/parking/live?${params}`, {
        signal: AbortSignal.timeout(60000),
      })
    } catch {
      throw new Error(
        '실시간 주차 조회에 실패했습니다. 개발 서버와 네트워크를 확인해주세요.',
      )
    }
    if (!response.ok)
      throw new Error(
        '실시간 주차 정보를 불러오지 못했습니다. API 키와 개발 서버 상태를 확인해주세요.',
      )
    const data = await response.json()
    if (!Array.isArray(data.lots))
      throw new Error('실시간 주차 서버 응답이 올바르지 않습니다.')
    return aggregateOccupancy(data.lots, center, radiusM, now)
  }
}
