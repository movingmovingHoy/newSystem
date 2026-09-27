import type { ParkingLot } from '@shared/types'
import type {
  Availability,
  ParkingProvider,
  ParkingSearch,
} from './types'

/**
 * 주차장 mock. 경유지 주변에 요금 있는 곳과 없는 곳을 섞어서 반환한다.
 * (AGENTS.md 10장: 요금 정보 없는 주차장도 후보에서 제외하지 않는다)
 */
export class MockParkingProvider implements ParkingProvider {
  async search(query: ParkingSearch): Promise<ParkingLot[]> {
    const { center } = query
    return [
      {
        id: 'mock-lot-1',
        name: '목업 공영주차장 A',
        location: { lat: center.lat + 0.001, lng: center.lng + 0.001 },
        fee: {
          baseFee: 1_000,
          baseTimeMin: 30,
          addFee: 500,
          addTimeMin: 10,
          dailyMaxFee: 20_000,
        },
        distanceToWaypointM: 150,
      },
      {
        id: 'mock-lot-2',
        name: '목업 민영주차장 B (요금 정보 없음)',
        location: { lat: center.lat - 0.001, lng: center.lng + 0.0015 },
        fee: null,
        distanceToWaypointM: 220,
      },
      {
        id: 'mock-lot-3',
        name: '목업 노상주차장 C',
        location: { lat: center.lat + 0.0012, lng: center.lng - 0.001 },
        fee: {
          baseFee: 800,
          baseTimeMin: 30,
          addFee: 400,
          addTimeMin: 10,
        },
        distanceToWaypointM: 380,
      },
    ]
  }

  async getAvailability(_lotId: string): Promise<Availability> {
    return { status: 'unknown' }
  }
}
