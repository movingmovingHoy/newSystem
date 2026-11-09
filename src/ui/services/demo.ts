import type { LatLng, Leg, TransitStep } from '@shared/types'
import { matchArea } from '@features/congestion'
import {
  MockCarProvider,
  MockTransitProvider,
  MockWalkProvider,
  type RouteProvider,
  type RouteQuery,
} from '@features/routing/providers'
import { MockParkingProvider } from '@features/parking/providers'
import { createJourneyService } from './journey'
import { findAreas, matchesKorean, type SearchPlace } from './catalog'
import { places } from './places'

/**
 * 데모 모드: API 키와 서버 없이 화면 전체를 끝까지 써볼 수 있게 하는 샘플 데이터.
 * `npm run demo` (vite --mode demo) 로 켠다. 값은 실제 경로·요금·주차 상황이 아니다.
 * 계산 로직(순서 최적화, 점수, 주차 압박 추천)은 실제 서비스와 같은 코드를 쓴다.
 */

type Env = { MODE?: string; VITE_DEMO?: string }

export function isDemoMode(env: Env = import.meta.env): boolean {
  return env.MODE === 'demo' || env.VITE_DEMO === 'true'
}

/** 자차: 이동 시간의 30%가 정체라고 가정한다 (피로도의 운전 정체 항목을 보여주기 위함). */
const CONGESTED_SHARE = 0.3

class DemoCarProvider implements RouteProvider {
  readonly mode = 'car' as const
  private readonly base = new MockCarProvider()
  async route(query: RouteQuery): Promise<Leg[]> {
    const legs = await this.base.route(query)
    return legs.map((leg) => ({
      ...leg,
      congestedDriveSec: Math.round(leg.durationSec * CONGESTED_SHARE),
    }))
  }
}

/** 대중교통: 도보 - 지하철 - 도보 구간 상세를 붙인다. 노선·역 이름은 샘플 표기다. */
class DemoTransitProvider implements RouteProvider {
  readonly mode = 'transit' as const
  private readonly base = new MockTransitProvider()
  async route(query: RouteQuery): Promise<Leg[]> {
    const legs = await this.base.route(query)
    return legs.map((leg) => {
      const totalMin = leg.durationSec / 60
      const walkMin = Math.min(3, totalMin / 4)
      const rideMin = Math.max(totalMin - walkMin * 2, 0)
      const steps: TransitStep[] = [
        { type: 'walk', minutes: walkMin, distanceM: 150 },
        {
          type: 'subway',
          line: '샘플 노선',
          from: '출발 인근 역',
          to: '도착 인근 역',
          minutes: rideMin,
          distanceM: 0,
          stationCount: Math.max(1, Math.round(rideMin / 2.5)),
        },
        { type: 'walk', minutes: walkMin, distanceM: 150 },
      ]
      return { ...leg, transitDetail: steps }
    })
  }
}

/**
 * 혼잡도 샘플: 서울 주요 121곳 안이면 시간대별 단계(KST), 밖이면 정보 없음.
 * 오후(12~19시)는 약간 붐빔, 저녁(20~21시)은 보통, 나머지는 여유.
 */
export async function demoCongestionLevelAt(
  location: LatLng,
  arriveAt: Date,
): Promise<number | null> {
  if (!matchArea(location)) return null
  const hour = (arriveAt.getUTCHours() + 9) % 24
  if (hour >= 12 && hour < 20) return 2
  if (hour >= 20 && hour < 22) return 1
  return 0
}

/** 주차 포화율 샘플. 강남·홍대 주변은 붐비고 도심 고궁 주변은 여유롭다. */
const OCCUPANCY_HOTSPOTS: { center: LatLng; ratio: number }[] = [
  { center: { lat: 37.498, lng: 127.0276 }, ratio: 0.84 }, // 강남역
  { center: { lat: 37.5572, lng: 126.9254 }, ratio: 0.78 }, // 홍대입구역
  { center: { lat: 37.5665, lng: 126.978 }, ratio: 0.41 }, // 서울시청
  { center: { lat: 37.5759, lng: 126.9768 }, ratio: 0.35 }, // 광화문
]
const HOTSPOT_RADIUS_M = 1500

function roughDistanceM(a: LatLng, b: LatLng): number {
  const dLat = (a.lat - b.lat) * 111_000
  const dLng = (a.lng - b.lng) * 88_000
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

export async function demoOccupancyAt(
  location: LatLng,
): Promise<{ ratio: number } | null> {
  for (const spot of OCCUPANCY_HOTSPOTS) {
    if (roughDistanceM(location, spot.center) <= HOTSPOT_RADIUS_M)
      return { ratio: spot.ratio }
  }
  // 그 밖의 위치: 좌표로 정한 0.30~0.90 사이 값 (같은 위치면 항상 같은 값)
  const seed =
    Math.sin(location.lat * 127.1 + location.lng * 311.7) * 43758.5453
  return { ratio: 0.3 + 0.6 * (seed - Math.floor(seed)) }
}

/** 샘플 장소 + 서울 주요 121곳에서 검색한다. 같은 이름은 샘플 장소를 우선한다. */
export function searchDemoPlaces(query: string): SearchPlace[] {
  const q = query.trim()
  if (!q) return []
  const base = places.filter((p) => matchesKorean(p.name, q))
  const names = new Set(base.map((p) => p.name))
  const areas = findAreas(q).filter((p) => !names.has(p.name))
  return [...base, ...areas].slice(0, 15)
}

export function createDemoJourneyService() {
  return createJourneyService(
    {
      car: new DemoCarProvider(),
      transit: new DemoTransitProvider(),
      walk: new MockWalkProvider(),
    },
    new MockParkingProvider(),
    demoCongestionLevelAt,
    demoOccupancyAt,
  )
}
