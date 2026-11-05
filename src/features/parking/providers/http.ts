import type { ParkingLot } from '@shared/types'
import type { ParkingProvider, ParkingSearch, Availability } from './types'
import { searchBounds } from './geo'
/** 브라우저 전용. 인증키 없이 같은 출처의 로컬 서버에 요청한다. */
export class HttpParkingProvider implements ParkingProvider {
  async search(query: ParkingSearch): Promise<ParkingLot[]> {
    searchBounds(query)
    const params = new URLSearchParams({
      lat: String(query.center.lat),
      lng: String(query.center.lng),
      radiusM: String(query.radiusM),
    })
    let response: Response
    try {
      response = await fetch(`/api/parking?${params}`, {
        signal: AbortSignal.timeout(300000),
      })
    } catch {
      throw new Error(
        '주차장 조회에 실패했습니다. 개발 서버와 네트워크를 확인해주세요.',
      )
    }
    if (!response.ok)
      throw new Error(
        '실제 주차장 데이터를 불러오지 못했습니다. API 키와 개발 서버 상태를 확인 후 다시 시도해주세요.',
      )
    const data = await response.json()
    if (!Array.isArray(data.lots))
      throw new Error('주차장 서버 응답이 올바르지 않습니다.')
    return data.lots
  }
  async getAvailability(_lotId: string): Promise<Availability> {
    return { status: 'unknown' }
  }
}
