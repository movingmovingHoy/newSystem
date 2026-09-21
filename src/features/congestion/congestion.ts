import type { LatLng, PlaceCongestion } from '@shared/types'
import { CONGESTION_CACHE_TTL_MIN } from '@shared/config'
import { matchArea } from './areas/areas'
import { parseCityData, pickForecastLevel, type CityData } from './calculator'
import type { CongestionProvider } from './providers'

/**
 * 혼잡도 서비스. AGENTS.md 11장.
 * 좌표 + 도착 예정 시각 → PlaceCongestion { level, areaCode? }
 *  - 좌표가 121곳 밖이면 provider 호출 없이 level=null
 *  - 안이면 areaCode 매칭 → provider(XML) 조회 → 도착시각 예측 level
 *  - 장소코드별로 CONGESTION_CACHE_TTL_MIN(30분) 캐시 (사용자 요청 시 필요한 곳만 호출)
 */

type CacheEntry = {
  data: CityData
  expiresAt: number
}

export class CongestionService {
  private readonly provider: CongestionProvider
  private readonly ttlMs = CONGESTION_CACHE_TTL_MIN * 60 * 1000
  private readonly cache = new Map<string, CacheEntry>()

  constructor(provider: CongestionProvider) {
    this.provider = provider
  }

  async getCongestion(
    location: LatLng,
    arriveAt: Date,
  ): Promise<PlaceCongestion> {
    const areaCode = matchArea(location)
    if (areaCode === null) {
      // 121곳 밖: 정보 없음
      return { level: null }
    }

    const data = await this.getCityData(areaCode)
    const level = pickForecastLevel(data, arriveAt)
    return { level, areaCode }
  }

  private async getCityData(areaCode: string): Promise<CityData> {
    const now = Date.now()
    const cached = this.cache.get(areaCode)
    if (cached && cached.expiresAt > now) {
      return cached.data
    }
    const xml = await this.provider.fetchRaw(areaCode)
    const data = parseCityData(xml)
    this.cache.set(areaCode, { data, expiresAt: now + this.ttlMs })
    return data
  }
}
