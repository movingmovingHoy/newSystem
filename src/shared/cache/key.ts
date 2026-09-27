import type { LatLng } from '@shared/types'
import {
  ROUTE_KEY_COORD_DECIMALS,
  ROUTE_KEY_TIME_BUCKET_MIN,
} from '@shared/config'

/**
 * 경로 캐시 키 생성. AGENTS.md 14장.
 * route:{mode}:{출발좌표}:{도착좌표}:{시간버킷}
 * 좌표는 소수점 ROUTE_KEY_COORD_DECIMALS 자리 반올림,
 * 시간은 ROUTE_KEY_TIME_BUCKET_MIN 분 버킷으로 정규화한다.
 * 이렇게 근처 좌표·시간대의 요청을 같은 키로 합쳐 API 호출을 줄인다.
 */

export type RouteKeyMode = 'car' | 'transit' | 'walk'

export type RouteKeyQuery = {
  from: LatLng
  to: LatLng
  /** ISO 8601. 없으면 지금 */
  departAt?: string
}

function roundCoord(n: number): string {
  return n.toFixed(ROUTE_KEY_COORD_DECIMALS)
}

function coordPair(p: LatLng): string {
  return `${roundCoord(p.lat)},${roundCoord(p.lng)}`
}

/** 시각을 30분(설정값) 버킷의 시작 시각 ISO 로 정규화 */
function timeBucket(departAt?: string): string {
  const t = departAt ? new Date(departAt).getTime() : Date.now()
  const bucketMs = ROUTE_KEY_TIME_BUCKET_MIN * 60 * 1000
  const floored = Math.floor(t / bucketMs) * bucketMs
  return new Date(floored).toISOString()
}

export function buildRouteKey(
  mode: RouteKeyMode,
  query: RouteKeyQuery,
): string {
  return [
    'route',
    mode,
    coordPair(query.from),
    coordPair(query.to),
    timeBucket(query.departAt),
  ].join(':')
}
