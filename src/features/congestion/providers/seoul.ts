import { areaNameOf } from '../areas/areas'
import type { CongestionProvider } from './types'

/**
 * 서울 실시간 도시데이터 provider. AGENTS.md 11장.
 * dev 프록시(/api/seoul)가 인증키를 URL에 삽입해 서울 서버로 전달한다.
 * 서울 API는 장소명으로 요청하므로 areaCode를 areaName으로 바꿔 호출한다.
 *   /api/seoul/citydata_ppltn/1/5/{장소명}
 *     → http://openapi.seoul.go.kr:8088/{KEY}/xml/citydata_ppltn/1/5/{장소명}
 */

const BASE = '/api/seoul/citydata_ppltn/1/5'

export class SeoulCongestionProvider implements CongestionProvider {
  async fetchRaw(areaCode: string): Promise<string> {
    const areaName = areaNameOf(areaCode)
    if (!areaName) {
      throw new Error(`알 수 없는 areaCode: ${areaCode}`)
    }

    const url = `${BASE}/${encodeURIComponent(areaName)}`
    const res = await fetch(url, { headers: { Accept: 'application/xml' } })
    if (!res.ok) {
      throw new Error(`서울 도시데이터 HTTP 오류: ${res.status}`)
    }
    return res.text()
  }
}
