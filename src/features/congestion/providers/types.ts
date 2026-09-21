/**
 * 혼잡도 provider 인터페이스. AGENTS.md 11장.
 * 소스: 서울시 실시간 도시데이터. 주요 121곳만, 한 번에 1개 장소만 호출 가능.
 * 응답에 최근 12시간 + 향후 12시간 예측이 들어있어 장소코드별로 30분 캐시하고
 * 도착 예정 시각의 예측값을 꺼내 쓴다.
 */

/** 예측 한 지점. ts 는 ISO 8601, level 은 혼잡 단계 인덱스. */
export type CongestionForecastPoint = {
  ts: string
  level: number
}

export type CongestionResponse = {
  areaCode: string
  /** 최근 12시간 + 향후 12시간 예측 */
  forecast: CongestionForecastPoint[]
}

export interface CongestionProvider {
  /** 장소코드 하나의 도시데이터 응답. 실패 시 예외. */
  fetch(areaCode: string): Promise<CongestionResponse>
}
