import { describe, it, expect } from 'vitest'
import { parseCityData, pickForecastLevel } from './calculator'

/**
 * 서울시 실시간 도시데이터(citydata_ppltn) XML 파싱 + 도착시각 예측 조회.
 * AGENTS.md 11장: 예측 배열에서 도착 예정 시각의 값을 꺼낸다.
 * 예측 범위(응답에 담긴 예측 시각들)를 벗어나면 null.
 * 시각 문자열은 KST(로컬) "YYYY-MM-DD HH:mm" 형식이다.
 */

const SAMPLE_XML = `<Map><SeoulRtd.citydata_ppltn>
<AREA_NM>광화문·덕수궁</AREA_NM><AREA_CD>POI009</AREA_CD>
<AREA_CONGEST_LVL>약간 붐빔</AREA_CONGEST_LVL>
<PPLTN_TIME>2026-09-21 12:30</PPLTN_TIME><FCST_YN>Y</FCST_YN>
<FCST_PPLTN>
<FCST_PPLTN><FCST_TIME>2026-09-21 14:00</FCST_TIME><FCST_CONGEST_LVL>약간 붐빔</FCST_CONGEST_LVL></FCST_PPLTN>
<FCST_PPLTN><FCST_TIME>2026-09-21 15:00</FCST_TIME><FCST_CONGEST_LVL>보통</FCST_CONGEST_LVL></FCST_PPLTN>
<FCST_PPLTN><FCST_TIME>2026-09-21 21:00</FCST_TIME><FCST_CONGEST_LVL>여유</FCST_CONGEST_LVL></FCST_PPLTN>
</FCST_PPLTN>
<RESULT><RESULT.CODE>INFO-000</RESULT.CODE></RESULT>
</SeoulRtd.citydata_ppltn></Map>`

describe('parseCityData', () => {
  it('areaCode, 현재 혼잡, 예측 배열을 파싱한다', () => {
    const data = parseCityData(SAMPLE_XML)
    expect(data.areaCode).toBe('POI009')
    expect(data.currentLevelName).toBe('약간 붐빔')
    expect(data.forecast).toHaveLength(3)
    expect(data.forecast[0].levelName).toBe('약간 붐빔')
    expect(data.forecast[1].levelName).toBe('보통')
  })
})

describe('pickForecastLevel', () => {
  const data = parseCityData(SAMPLE_XML)

  it('도착시각과 같은 시간대(정시)의 예측 단계를 인덱스로 반환한다', () => {
    // 15:00 예측 = 보통(1)
    const level = pickForecastLevel(data, new Date('2026-09-21T15:00:00+09:00'))
    expect(level).toBe(1)
  })

  it('예측 시각 사이면 가장 가까운 예측을 고른다', () => {
    // 14:40 → 15:00(보통=1)이 더 가깝다
    const level = pickForecastLevel(data, new Date('2026-09-21T14:40:00+09:00'))
    expect(level).toBe(1)
  })

  it('예측 범위를 벗어난 시각(첫 예측 이전)은 null', () => {
    const level = pickForecastLevel(data, new Date('2026-09-21T10:00:00+09:00'))
    expect(level).toBeNull()
  })

  it('예측 범위를 벗어난 시각(마지막 예측 이후 한참)은 null', () => {
    const level = pickForecastLevel(data, new Date('2026-09-22T05:00:00+09:00'))
    expect(level).toBeNull()
  })

  it('여유(0)/보통(1)/약간 붐빔(2) 문자열이 올바른 인덱스로 변환된다', () => {
    expect(pickForecastLevel(data, new Date('2026-09-21T21:00:00+09:00'))).toBe(
      0,
    ) // 여유
    expect(pickForecastLevel(data, new Date('2026-09-21T14:00:00+09:00'))).toBe(
      2,
    ) // 약간 붐빔
  })
})
