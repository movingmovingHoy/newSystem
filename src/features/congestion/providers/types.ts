/**
 * 혼잡도 provider 인터페이스. AGENTS.md 11장.
 * 소스: 서울시 실시간 도시데이터(citydata_ppltn). 주요 121곳만, 한 번에 1개 장소만 호출.
 * 응답은 XML 문자열이며, 최근 값 + 향후 예측이 들어있다.
 * 파싱은 calculator(parseCityData)가, 30분 캐시는 상위(congestion)가 담당한다.
 */

export interface CongestionProvider {
  /** 장소코드 하나의 도시데이터 원본 XML. 실패 시 예외. */
  fetchRaw(areaCode: string): Promise<string>
}
