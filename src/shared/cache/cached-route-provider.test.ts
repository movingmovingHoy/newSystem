import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CachedRouteProvider } from './cached-route-provider'
import type { RouteProvider, RouteQuery } from '@features/routing/providers'
import type { Leg } from '@shared/types'

/**
 * CachedRouteProvider: RouteProvider 를 감싸 캐시를 입힌 래퍼. AGENTS.md 14장.
 * - 같은 키는 원본을 한 번만 호출 (히트)
 * - 동일 키 동시 요청은 API 한 번으로 합침
 * - mode별 TTL 만료 후 재호출
 * - 원본 실패 시 만료된 캐시라도 반환하는 폴백(옵션)
 * - 히트/미스/합쳐진 요청 카운터
 */

const from = { lat: 37.5547, lng: 126.9707 }
const to = { lat: 37.4979, lng: 127.0276 }
const baseQuery: RouteQuery = {
  from,
  to,
  departAt: '2026-09-21T09:00:00.000Z',
}

function fakeLeg(durationSec: number): Leg {
  return {
    mode: 'car',
    from,
    to,
    departAt: baseQuery.departAt!,
    arriveAt: baseQuery.departAt!,
    durationSec,
    cost: 0,
    walkDistanceM: 0,
    transfers: 0,
    fatigue: 0,
  }
}

/** 호출 횟수를 세고, 매 호출마다 다른 값을 주는 가짜 provider */
function makeSpyProvider(
  mode: RouteProvider['mode'] = 'car',
): RouteProvider & { calls: number } {
  const p = {
    mode,
    calls: 0,
    async route(_q: RouteQuery): Promise<Leg[]> {
      p.calls += 1
      return [fakeLeg(p.calls * 100)]
    },
  }
  return p
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-21T09:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CachedRouteProvider', () => {
  it('감싼 provider의 mode를 그대로 노출한다', () => {
    const cached = new CachedRouteProvider(makeSpyProvider('transit'))
    expect(cached.mode).toBe('transit')
  })

  it('같은 키 두 번째 호출은 캐시 히트로 원본을 다시 부르지 않는다', async () => {
    const inner = makeSpyProvider()
    const cached = new CachedRouteProvider(inner)

    const first = await cached.route(baseQuery)
    const second = await cached.route(baseQuery)

    expect(inner.calls).toBe(1)
    expect(second).toEqual(first)
    expect(cached.stats.hits).toBe(1)
    expect(cached.stats.misses).toBe(1)
  })

  it('동일 키 동시 요청은 원본을 한 번만 부른다 (합치기)', async () => {
    const inner = makeSpyProvider()
    const cached = new CachedRouteProvider(inner)

    const [a, b] = await Promise.all([
      cached.route(baseQuery),
      cached.route(baseQuery),
    ])

    expect(inner.calls).toBe(1)
    expect(a).toEqual(b)
    expect(cached.stats.coalesced).toBe(1)
  })

  it('TTL이 지나면 원본을 다시 부른다', async () => {
    const inner = makeSpyProvider('car') // carRoute TTL = 20분
    const cached = new CachedRouteProvider(inner)

    await cached.route(baseQuery)
    // 21분 경과 (car TTL 20분 초과)
    vi.setSystemTime(new Date('2026-09-21T09:21:00.000Z'))
    await cached.route({ ...baseQuery, departAt: '2026-09-21T09:00:00.000Z' })

    expect(inner.calls).toBe(2)
  })

  it('원본이 실패하고 fallbackToStale=true 면 만료된 캐시를 반환한다', async () => {
    let shouldFail = false
    const inner: RouteProvider = {
      mode: 'car',
      async route() {
        if (shouldFail) throw new Error('API down')
        return [fakeLeg(500)]
      },
    }
    const cached = new CachedRouteProvider(inner, { fallbackToStale: true })

    const fresh = await cached.route(baseQuery)
    // TTL 만료시키고 원본을 실패로
    vi.setSystemTime(new Date('2026-09-21T10:00:00.000Z'))
    shouldFail = true
    const stale = await cached.route(baseQuery)

    expect(stale).toEqual(fresh)
    expect(cached.stats.staleFallbacks).toBe(1)
  })

  it('원본이 실패하고 폴백이 없으면 예외를 던진다', async () => {
    const inner: RouteProvider = {
      mode: 'car',
      async route() {
        throw new Error('API down')
      },
    }
    const cached = new CachedRouteProvider(inner) // fallback 기본 off
    await expect(cached.route(baseQuery)).rejects.toThrow('API down')
  })
})
