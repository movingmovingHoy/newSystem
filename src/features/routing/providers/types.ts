import type { LatLng, Leg } from '@shared/types'

/**
 * 길찾기 provider 인터페이스. AGENTS.md 5장: 외부 API 호출은 providers 안에서만.
 * 구현체는 카카오모빌리티(자차), 카카오 대중교통, 카카오 도보 (13장).
 * 처음에는 mock, 이후 실제 API. 캐싱은 provider가 아니라 래퍼로 구현 (14장).
 */

export type RouteQuery = {
  from: LatLng
  to: LatLng
  /** ISO 8601. 없으면 지금 */
  departAt?: string
}

export interface RouteProvider {
  readonly mode: 'car' | 'transit' | 'walk'
  /** 단일 구간 경로. 실패 시 예외를 던진다. */
  route(query: RouteQuery): Promise<Leg[]>
}
