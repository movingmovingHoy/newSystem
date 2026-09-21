import type {
  CongestionForecastPoint,
  CongestionProvider,
  CongestionResponse,
} from './types'

/**
 * 혼잡도 mock. 요청한 장소코드에 대해 30분 간격 24시간(과거12+미래12) 예측을
 * 생성한다. 단계는 0~3 사이를 시간대에 따라 흔든다.
 */
export class MockCongestionProvider implements CongestionProvider {
  async fetch(areaCode: string): Promise<CongestionResponse> {
    const now = Date.now()
    const forecast: CongestionForecastPoint[] = []
    for (let i = -24; i <= 24; i++) {
      const ts = new Date(now + i * 30 * 60 * 1000)
      const hour = ts.getHours()
      // 출퇴근 시간대는 붐빔, 심야는 여유
      const level =
        hour >= 8 && hour <= 10 ? 3 : hour >= 17 && hour <= 20 ? 2 : hour < 6 ? 0 : 1
      forecast.push({ ts: ts.toISOString(), level })
    }
    return { areaCode, forecast }
  }
}
