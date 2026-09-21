import type { Leg } from '@shared/types'
import type { RouteProvider, RouteQuery } from './types'

/**
 * 카카오모빌리티 도보 길찾기 provider. AGENTS.md 13장.
 * 도보 API도 apis-navi.kakaomobility.com 호스트라 기존 navi 프록시를 재사용한다.
 * 응답: routes[0].summary { distance(m), duration(sec) }
 */

const WALK_DIRECTIONS_PATH = '/api/kakao/navi/affiliate/walking/v1/directions'

type KakaoWalkResponse = {
  routes?: Array<{
    result_code?: number
    result_message?: string
    summary?: { distance?: number; duration?: number }
  }>
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString()
}

export class KakaoWalkProvider implements RouteProvider {
  readonly mode = 'walk' as const

  async route(query: RouteQuery): Promise<Leg[]> {
    const { from, to } = query
    const departAt = query.departAt ?? new Date().toISOString()

    const params = new URLSearchParams({
      origin: `${from.lng},${from.lat}`,
      destination: `${to.lng},${to.lat}`,
    })

    const res = await fetch(`${WALK_DIRECTIONS_PATH}?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      throw new Error(`카카오 도보 길찾기 HTTP 오류: ${res.status}`)
    }

    const data = (await res.json()) as KakaoWalkResponse
    const route = data.routes?.[0]
    if (!route) {
      throw new Error('카카오 도보 응답에 경로가 없습니다')
    }
    if (route.result_code !== 0) {
      throw new Error(
        `카카오 도보 길찾기 실패(code=${route.result_code}): ${route.result_message ?? '알 수 없음'}`,
      )
    }

    const distance = route.summary?.distance ?? 0
    const durationSec = route.summary?.duration ?? 0

    const leg: Leg = {
      mode: 'walk',
      from,
      to,
      departAt,
      arriveAt: addSeconds(departAt, durationSec),
      durationSec,
      cost: 0,
      walkDistanceM: distance,
      transfers: 0,
      fatigue: 0, // 피로도는 scoring 단위에서 도보거리로 계산
    }
    return [leg]
  }
}
