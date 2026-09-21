import { congestLevelIndex } from '@shared/config'

/**
 * 서울시 실시간 도시데이터(citydata_ppltn) 파싱과 예측 조회. AGENTS.md 11장.
 * 응답 XML에서 areaCode, 현재 혼잡, 향후 예측 배열을 뽑고,
 * 도착 예정 시각에 해당하는 예측 단계를 인덱스로 돌려준다.
 * 예측 범위를 벗어나면 null (정보 없음).
 */

export type ForecastPoint = {
  /** 예측 시각 (KST 기준 epoch ms) */
  timeMs: number
  levelName: string
}

export type CityData = {
  areaCode: string | null
  currentLevelName: string | null
  currentTimeMs: number | null
  forecast: ForecastPoint[]
}

/** 예측 정시와 도착시각의 허용 오차. 이보다 멀면 범위 밖으로 본다 (예측은 1시간 간격) */
const FORECAST_TOLERANCE_MS = 90 * 60 * 1000

function tagValue(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml)
  return m ? m[1].trim() : null
}

/** "YYYY-MM-DD HH:mm" (KST) → epoch ms */
function parseKst(s: string | null): number | null {
  if (!s) return null
  const m = /(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/.exec(s)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  // KST(+09:00) 기준 시각으로 해석
  return Date.parse(`${y}-${mo}-${d}T${h}:${mi}:00+09:00`)
}

export function parseCityData(xml: string): CityData {
  const areaCode = tagValue(xml, 'AREA_CD')
  const currentLevelName = tagValue(xml, 'AREA_CONGEST_LVL')
  const currentTimeMs = parseKst(tagValue(xml, 'PPLTN_TIME'))

  const forecast: ForecastPoint[] = []
  // 각 <FCST_PPLTN> ... </FCST_PPLTN> 블록에서 시각/단계 추출
  const blockRe = /<FCST_PPLTN>([\s\S]*?)<\/FCST_PPLTN>/g
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[1]
    const t = parseKst(tagValue(block, 'FCST_TIME'))
    const levelName = tagValue(block, 'FCST_CONGEST_LVL')
    if (t !== null && levelName) forecast.push({ timeMs: t, levelName })
  }

  return { areaCode, currentLevelName, currentTimeMs, forecast }
}

/**
 * 도착 예정 시각에 해당하는 예측 혼잡 단계 인덱스.
 * 가장 가까운 예측을 고르되, 허용 오차를 넘으면(=예측 범위 밖) null.
 */
export function pickForecastLevel(
  data: CityData,
  arriveAt: Date,
): number | null {
  if (data.forecast.length === 0) return null
  const target = arriveAt.getTime()

  let nearest: ForecastPoint | null = null
  let nearestDiff = Infinity
  for (const p of data.forecast) {
    const diff = Math.abs(p.timeMs - target)
    if (diff < nearestDiff) {
      nearestDiff = diff
      nearest = p
    }
  }

  if (!nearest || nearestDiff > FORECAST_TOLERANCE_MS) return null
  return congestLevelIndex(nearest.levelName)
}
