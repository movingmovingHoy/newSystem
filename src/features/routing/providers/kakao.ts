import type { Leg } from '@shared/types'
import type { RouteProvider, RouteQuery } from './types'

/**
 * 카카오모빌리티 자차 길찾기 provider. AGENTS.md 13장.
 * 프론트/서버 모두 dev 프록시 경로(/api/kakao/navi)로 호출한다.
 * 프록시가 Authorization 헤더를 붙이므로 여기서 키를 다루지 않는다 (17장).
 * 캐싱은 provider가 아니라 래퍼가 담당한다 (14장).
 */

/** dev 프록시가 https://apis-navi.kakaomobility.com 로 전달한다 */
const NAVI_DIRECTIONS_PATH = '/api/kakao/navi/v1/directions'

/** 카카오 응답 중 우리가 쓰는 필드만 방어적으로 정의 */
type KakaoDirectionsResponse = {
  routes?: Array<{
    result_code?: number
    result_msg?: string
    summary?: {
      duration?: number
      distance?: number
      fare?: { taxi?: number; toll?: number }
    }
  }>
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString()
}

export class KakaoCarProvider implements RouteProvider {
  readonly mode = 'car' as const

  async route(query: RouteQuery): Promise<Leg[]> {
    const { from, to } = query
    const departAt = query.departAt ?? new Date().toISOString()

    // 카카오는 origin/destination 을 "경도,위도" 문자열로 받는다
    const params = new URLSearchParams({
      origin: `${from.lng},${from.lat}`,
      destination: `${to.lng},${to.lat}`,
    })

    const res = await fetch(`${NAVI_DIRECTIONS_PATH}?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      throw new Error(`카카오 길찾기 HTTP 오류: ${res.status}`)
    }

    const data = (await res.json()) as KakaoDirectionsResponse
    const route = data.routes?.[0]
    if (!route) {
      throw new Error('카카오 길찾기 응답에 경로가 없습니다')
    }
    if (route.result_code !== 0) {
      throw new Error(
        `카카오 길찾기 실패(code=${route.result_code}): ${route.result_msg ?? '알 수 없음'}`,
      )
    }

    const durationSec = route.summary?.duration ?? 0
    const toll = route.summary?.fare?.toll ?? 0

    const leg: Leg = {
      mode: 'car',
      from,
      to,
      departAt,
      arriveAt: addSeconds(departAt, durationSec),
      durationSec,
      cost: toll, // 통행료 (교통비/통행료만, 주차비 제외)
      walkDistanceM: 0,
      transfers: 0,
      fatigue: 0, // 정체 기반 피로도는 scoring 단위에서 다룬다
    }
    return [leg]
  }
}
