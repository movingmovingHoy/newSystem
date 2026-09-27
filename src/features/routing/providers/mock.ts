import type { Leg, LatLng } from '@shared/types'
import type { RouteProvider, RouteQuery } from './types'
import { WALK_SPEED_KMH, WALK_DETOUR_FACTOR } from '@shared/config'

/** 두 좌표의 대략적인 직선 거리 (m). mock 소요시간 계산용, 실제 로직 아님. */
function roughDistanceM(a: LatLng, b: LatLng): number {
  const dLat = (a.lat - b.lat) * 111_000
  const dLng = (a.lng - b.lng) * 88_000
  return Math.round(Math.sqrt(dLat * dLat + dLng * dLng))
}

function baseLeg(
  mode: Leg['mode'],
  query: RouteQuery,
  durationSec: number,
  overrides: Partial<Leg>,
): Leg {
  const departAt = query.departAt ?? new Date().toISOString()
  const arriveAt = new Date(
    new Date(departAt).getTime() + durationSec * 1000,
  ).toISOString()
  return {
    mode,
    from: query.from,
    to: query.to,
    departAt,
    arriveAt,
    durationSec,
    cost: 0,
    walkDistanceM: 0,
    transfers: 0,
    fatigue: 0,
    ...overrides,
  }
}

/** 자차 mock: 도심 평균 20km/h 가정. */
export class MockCarProvider implements RouteProvider {
  readonly mode = 'car' as const
  async route(query: RouteQuery): Promise<Leg[]> {
    const distM = roughDistanceM(query.from, query.to)
    const durationSec = Math.round(distM / (20_000 / 3600) || 0)
    return [baseLeg('car', query, durationSec, { cost: 0, fatigue: 10 })]
  }
}

/** 대중교통 mock: 평균 25km/h + 환승 1회 가정. */
export class MockTransitProvider implements RouteProvider {
  readonly mode = 'transit' as const
  async route(query: RouteQuery): Promise<Leg[]> {
    const distM = roughDistanceM(query.from, query.to)
    const durationSec = Math.round(distM / (25_000 / 3600) || 0)
    return [
      baseLeg('subway', query, durationSec, {
        cost: 1_400,
        transfers: 1,
        fatigue: 30,
        walkDistanceM: 200,
      }),
    ]
  }
}

/**
 * 도보 mock: 직선거리에 우회계수를 곱해 실제 도보거리를 추정하고,
 * 도시 보행자 평균 속도로 소요시간을 낸다. (config: WALK_SPEED_KMH, WALK_DETOUR_FACTOR)
 */
export class MockWalkProvider implements RouteProvider {
  readonly mode = 'walk' as const
  async route(query: RouteQuery): Promise<Leg[]> {
    const straightM = roughDistanceM(query.from, query.to)
    const walkM = Math.round(straightM * WALK_DETOUR_FACTOR)
    const speedMps = (WALK_SPEED_KMH * 1000) / 3600
    const durationSec = Math.round(walkM / speedMps || 0)
    return [
      baseLeg('walk', query, durationSec, {
        walkDistanceM: walkM,
        fatigue: Math.min(100, walkM / 50),
      }),
    ]
  }
}
