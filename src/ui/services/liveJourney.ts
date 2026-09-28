import {
  KakaoCarProvider,
  OdsayTransitProvider,
  MockWalkProvider,
} from '@features/routing/providers'
import {
  CongestionService,
  SeoulCongestionProvider,
} from '@features/congestion'
import { SampleParkingProvider } from '@features/parking/providers'
import { createInitialDraft, createJourneyService } from './journey'
import { findAreas } from './catalog'

export function createLiveDraft() {
  const draft = createInitialDraft()
  const areas = findAreas('')
  draft.originId = (areas.find((p) => p.name === '서울역') ?? areas[0]).id
  draft.destinationId = (areas.find((p) => p.name === '강남역') ?? areas[1]).id
  // 실제 주차장 API는 아직 연결 전이므로 우선 경유지 없이 실제 경로를 비교한다.
  draft.waypoints = []
  return draft
}
export function createLiveJourneyService() {
  const congestion = new CongestionService(new SeoulCongestionProvider())
  const areas = findAreas('')
  return createJourneyService(
    {
      car: new KakaoCarProvider(),
      transit: new OdsayTransitProvider(),
      // 유료 도보 API 미연결 상태를 화면에 명시한다. 자동차·대중교통 실패는 mock으로 대체하지 않는다.
      walk: new MockWalkProvider(),
    },
    new SampleParkingProvider(),
    async (location, arriveAt) => {
      const area = areas.find(
        (p) =>
          p.location.lat === location.lat && p.location.lng === location.lng,
      )
      const result = area?.areaCode
        ? await congestion.getCongestionByArea(area.areaCode, arriveAt)
        : await congestion.getCongestion(location, arriveAt)
      return result.level
    },
  )
}
