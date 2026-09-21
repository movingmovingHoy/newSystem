import type { CongestionProvider } from './types'

/**
 * 혼잡도 mock. 요청한 장소코드에 대해 citydata_ppltn 형식의 XML을 생성한다.
 * 향후 12시간을 1시간 간격으로, 시간대에 따라 단계를 흔든다.
 */
export class MockCongestionProvider implements CongestionProvider {
  async fetchRaw(areaCode: string): Promise<string> {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
        d.getHours(),
      )}:${pad(d.getMinutes())}`

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
      const t = new Date(now.getTime() + i * 60 * 60 * 1000)
      blocks.push(
        `<FCST_PPLTN><FCST_TIME>${fmt(t)}</FCST_TIME><FCST_CONGEST_LVL>${levelFor(
          t.getHours(),
        )}</FCST_CONGEST_LVL></FCST_PPLTN>`,
      )
    }

    return `<Map><SeoulRtd.citydata_ppltn><AREA_CD>${areaCode}</AREA_CD><AREA_CONGEST_LVL>${levelFor(
      now.getHours(),
    )}</AREA_CONGEST_LVL><PPLTN_TIME>${fmt(now)}</PPLTN_TIME><FCST_YN>Y</FCST_YN><FCST_PPLTN>${blocks.join(
      '',
    )}</FCST_PPLTN><RESULT><RESULT.CODE>INFO-000</RESULT.CODE></RESULT></SeoulRtd.citydata_ppltn></Map>`
  }
}
