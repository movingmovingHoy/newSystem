import {
  KakaoCarProvider,
  OdsayTransitProvider,
  MockWalkProvider,
} from '@features/routing/providers'
import {
  CongestionService,
  SeoulCongestionProvider,
} from '@features/congestion'
import { HttpParkingProvider } from '@features/parking/providers/http'
import { HttpLiveParkingProvider } from '@features/parking/providers/http-live'
import { createInitialDraft, createJourneyService } from './journey'
import { findAreas } from './catalog'

export function createLiveDraft() {
  const draft = createInitialDraft()
  const areas = findAreas('')
  draft.originId = (areas.find((p) => p.name === '서울역') ?? areas[0]).id
  // 도착지 최소 1개. 기본값으로 강남역 1곳을 둔다(종점이자 첫 도착지).
  const gangnam = areas.find((p) => p.name === '강남역') ?? areas[1]
  draft.waypoints = [
    {
      id: 'visit-1',
      placeId: gangnam.id,
      dwellMin: draft.waypoints[0].dwellMin,
    },
  ]
  return draft
}
export function createLiveJourneyService() {
  const congestion = new CongestionService(new SeoulCongestionProvider())
  const liveParking = new HttpLiveParkingProvider()
  return createJourneyService(
    {
      car: new KakaoCarProvider(),
      transit: new OdsayTransitProvider(),
      // 유료 도보 API 미연결 상태를 화면에 명시한다. 자동차·대중교통 실패는 mock으로 대체하지 않는다.
      walk: new MockWalkProvider(),
    },
    new HttpParkingProvider(),
    async (location, arriveAt) => {
      const result = await congestion.getCongestion(location, arriveAt)
      return result.level
    },
    // 목적지 주변 실시간 주차 포화율. 실패하면 던지고, 정보 없음 처리는 planRoutes 가 한다.
    (location) => liveParking.occupancy(location),
  )
}
