import type { Leg } from '@shared/types'
import type { RouteProvider, RouteQuery } from '@features/routing/providers'
import { CACHE_TTL_SEC } from '@shared/config'
import { buildRouteKey } from './key'

/**
 * RouteProvider 를 감싸 캐시를 입힌 래퍼. AGENTS.md 14장.
 * 자신도 RouteProvider 라 optimizer/strategies 가 투명하게 바꿔 쓸 수 있다.
 *
 * - 경로 키로 결과를 캐시 (buildRouteKey)
 * - mode별 TTL (자차 20분 / 대중교통 3시간 / 도보 1시간)
 * - 동일 키 동시 요청은 in-flight 로 합쳐 원본을 한 번만 호출
 * - fallbackToStale: 원본 실패 시 만료된 캐시라도 반환
 * - hits/misses/coalesced/staleFallbacks 카운터
 *
 * TTL은 Date.now() 기반으로 직접 관리해 테스트(fake timer)에서도 결정적이다.
 */

type Entry = {
  value: Leg[]
  /** epoch ms. 이 시각 이후면 만료 */
  expiresAt: number
}

export type CacheStats = {
  hits: number
  misses: number
  coalesced: number
  staleFallbacks: number
}

export type CachedRouteProviderOptions = {
  /** 원본 실패 시 만료된 캐시라도 반환 (AGENTS.md 14장 폴백) */
  fallbackToStale?: boolean
  /** 캐시 최대 항목 수 (메모리 상한) */
  maxEntries?: number
}

const TTL_BY_MODE: Record<RouteProvider['mode'], number> = {
  car: CACHE_TTL_SEC.carRoute,
  transit: CACHE_TTL_SEC.transitRoute,
  walk: CACHE_TTL_SEC.walkRoute,
}

export class CachedRouteProvider implements RouteProvider {
  readonly mode: RouteProvider['mode']

  private readonly inner: RouteProvider
  private readonly fallbackToStale: boolean
  private readonly maxEntries: number
  private readonly store = new Map<string, Entry>()
  private readonly inFlight = new Map<string, Promise<Leg[]>>()

  readonly stats: CacheStats = {
    hits: 0,
    misses: 0,
    coalesced: 0,
    staleFallbacks: 0,
  }

  constructor(inner: RouteProvider, options: CachedRouteProviderOptions = {}) {
    this.inner = inner
    this.mode = inner.mode
    this.fallbackToStale = options.fallbackToStale ?? false
    this.maxEntries = options.maxEntries ?? 500
  }

  async route(query: RouteQuery): Promise<Leg[]> {
    const key = buildRouteKey(this.mode, query)
    const now = Date.now()

    // 1) 신선한 캐시 히트
    const cached = this.store.get(key)
    if (cached && cached.expiresAt > now) {
      this.stats.hits += 1
      return cached.value
    }

    // 2) 이미 같은 키로 진행 중인 요청이 있으면 합친다
    const pending = this.inFlight.get(key)
    if (pending) {
      this.stats.coalesced += 1
      return pending
    }

    // 3) 원본 호출 (miss)
    this.stats.misses += 1
    const promise = this.inner
      .route(query)
      .then((legs) => {
        this.set(key, legs)
        return legs
      })
      .catch((err) => {
        // 폴백: 만료됐더라도 값이 있으면 반환
        if (this.fallbackToStale && cached) {
          this.stats.staleFallbacks += 1
          return cached.value
        }
        throw err
      })
      .finally(() => {
        this.inFlight.delete(key)
      })

    this.inFlight.set(key, promise)
    return promise
  }

  private set(key: string, value: Leg[]): void {
    const ttlSec = TTL_BY_MODE[this.mode]
    this.store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 })
    // 간단한 크기 제한: 초과 시 가장 오래된 항목부터 제거
    if (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next().value
      if (oldest !== undefined) this.store.delete(oldest)
    }
  }
}
