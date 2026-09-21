import type { CongestionProvider } from './types'
import { formatKst, kstHour } from '../calculator'

/**
 * 혼잡도 mock. 요청한 장소코드에 대해 citydata_ppltn 형식의 XML을 생성한다.
 * 향후 12시간을 1시간 간격으로, 시간대에 따라 단계를 흔든다.
 * 시각은 실행 환경 타임존과 무관하게 항상 KST로 포맷한다.
 */
export class MockCongestionProvider implements CongestionProvider {
  async fetchRaw(areaCode: string): Promise<string> {
    const nowMs = Date.now()

    const levelFor = (hour: number): string =>
      hour >= 8 && hour <= 10
        ? '붐빔'
        : hour >= 17 && hour <= 20
          ? '약간 붐빔'
          : hour < 6
            ? '여유'
            : '보통'

    const blocks: string[] = []
    for (let i = 1; i <= 12; i++) {
      const tMs = nowMs + i * 60 * 60 * 1000
      blocks.push(
        `<FCST_PPLTN><FCST_TIME>${formatKst(tMs)}</FCST_TIME><FCST_CONGEST_LVL>${levelFor(
          kstHour(tMs),
        )}</FCST_CONGEST_LVL></FCST_PPLTN>`,
      )
    }

    return `<Map><SeoulRtd.citydata_ppltn><AREA_CD>${areaCode}</AREA_CD><AREA_CONGEST_LVL>${levelFor(
      kstHour(nowMs),
    )}</AREA_CONGEST_LVL><PPLTN_TIME>${formatKst(nowMs)}</PPLTN_TIME><FCST_YN>Y</FCST_YN><FCST_PPLTN>${blocks.join(
      '',
    )}</FCST_PPLTN><RESULT><RESULT.CODE>INFO-000</RESULT.CODE></RESULT></SeoulRtd.citydata_ppltn></Map>`
  }
}
