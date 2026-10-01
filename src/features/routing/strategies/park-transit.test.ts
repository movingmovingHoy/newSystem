import { describe, it, expect } from 'vitest'
import { buildParkTransitRoute } from './park-transit'
import type { RouteProvider, RouteQuery } from '../providers'
import type { Leg, Waypoint } from '@shared/types'

/**
 * park-transit (자차 주차 후 대중교통 전환) 전략 테스트. AGENTS.md 8-1.
 * 출발→A 자차 + A→B 대중교통. 외부 API는 mock(AGENTS.md 15장).
 */

const origin = { lat: 37.5547, lng: 126.9707 }

const wp = (
  id: string,
  lat: number,
  lng: number,
  dwellMin: number,
): Waypoint => ({
  id,
  location: { lat, lng },
  dwellMin,
})

function carProvider(durationSec: number, toll = 0): RouteProvider {
  return {
    mode: 'car',
    async route(q: RouteQuery): Promise<Leg[]> {
      return [
        {
          mode: 'car',
          from: q.from,
          to: q.to,
          departAt: q.departAt ?? '',
          arriveAt: q.departAt ?? '',
          durationSec,
          cost: toll,
          walkDistanceM: 0,
          transfers: 0,
          fatigue: 0,
        },
      ]
    },
  }
}

function transitProvider(durationSec: number, fare = 1400): RouteProvider {
  return {
    mode: 'transit',
    async route(q: RouteQuery): Promise<Leg[]> {
      return [
        {
          mode: 'subway',
          from: q.from,
          to: q.to,
          departAt: q.departAt ?? '',
          arriveAt: q.departAt ?? '',
          durationSec,
          cost: fare,
          walkDistanceM: 300,
          transfers: 1,
          fatigue: 0,
        },
      ]
    },
  }
}

describe('buildParkTransitRoute', () => {
  it('출발→A 자차 1구간 + A→B 대중교통 1구간으로 구성한다', async () => {
    const route = await buildParkTransitRoute(
      { car: carProvider(1200, 900), transit: transitProvider(1500) },
      {
        origin,
        parkAt: wp('A', 37.52, 127.0, 30), // A: 주차 지점, 체류 30분
        destination: wp('B', 37.51, 127.01, 0),
        departAt: '2026-09-21T09:00:00.000Z',
        preference: 'time',
      },
    )

    expect(route.scenario).toBe('park-transit')
    expect(route.legs).toHaveLength(2)
    // 1구간 자차, 2구간 대중교통
    expect(route.legs[0].mode).toBe('car')
    expect(route.legs[0].role).toBe('drive')
    expect(route.legs[1].mode).toBe('subway')
    // 총 이동시간 = 자차 1200 + 대중교통 1500
    expect(route.totals.durationSec).toBe(2700)
    // A가 유일한 중간 정차 → stop 1개
    expect(route.stops).toHaveLength(1)
    expect(route.stops[0].waypointId).toBe('A')
    expect(route.stops[0].accessMode).toBe('transit')
  })

  it('타임라인이 A 체류시간을 누적한다', async () => {
    const route = await buildParkTransitRoute(
      { car: carProvider(600), transit: transitProvider(600) },
      {
        origin,
        parkAt: wp('A', 37.52, 127.0, 30),
        destination: wp('B', 37.51, 127.01, 0),
        departAt: '2026-09-21T09:00:00.000Z',
        preference: 'time',
      },
    )
    // 09:00 + 자차 10분 = 09:10 A 도착, +30분 체류 = 09:40 출발
    expect(route.stops[0].arriveAt).toBe('2026-09-21T09:10:00.000Z')
    expect(route.stops[0].departAt).toBe('2026-09-21T09:40:00.000Z')
  })

  it('주차 실데이터가 없어 주차비는 정보 없음(parkingCostPartial)이다', async () => {
    const route = await buildParkTransitRoute(
      { car: carProvider(600, 900), transit: transitProvider(600, 1400) },
      {
        origin,
        parkAt: wp('A', 37.52, 127.0, 30),
        destination: wp('B', 37.51, 127.01, 0),
        departAt: '2026-09-21T09:00:00.000Z',
        preference: 'time',
      },
    )
    expect(route.totals.parkingCostPartial).toBe(true)
    expect(route.stops[0].parkingFee).toBeNull()
    // 비용은 교통비/통행료만 (통행료 900 + 대중교통 1400)
    expect(route.totals.cost).toBe(2300)
  })

  it('대중교통 구간 조회는 A 도착+체류 누적 시각으로 한다', async () => {
    const seen: string[] = []
    const transit: RouteProvider = {
      mode: 'transit',
      async route(q: RouteQuery): Promise<Leg[]> {
        seen.push(q.departAt!)
        return [
          {
            mode: 'subway',
            from: q.from,
            to: q.to,
            departAt: q.departAt!,
            arriveAt: q.departAt!,
            durationSec: 600,
            cost: 1400,
            walkDistanceM: 0,
            transfers: 0,
            fatigue: 0,
          },
        ]
      },
    }
    await buildParkTransitRoute(
      { car: carProvider(600), transit },
      {
        origin,
        parkAt: wp('A', 37.52, 127.0, 30),
        destination: wp('B', 37.51, 127.01, 0),
        departAt: '2026-09-21T09:00:00.000Z',
        preference: 'time',
      },
    )
    // A→B 대중교통은 09:00 + 자차 10분 + 체류 30분 = 09:40 시각으로 조회
    expect(seen[0]).toBe('2026-09-21T09:40:00.000Z')
  })

  it('도착지(B) 혼잡을 점수에 반영한다', async () => {
    const base = {
      origin,
      parkAt: wp('A', 37.52, 127.0, 30),
      destination: wp('B', 37.51, 127.01, 0),
      departAt: '2026-09-21T09:00:00.000Z',
      preference: 'time' as const,
    }
    const providers = { car: carProvider(600), transit: transitProvider(600) }
    const busy = await buildParkTransitRoute(providers, {
      ...base,
      congestionLevelAt: async () => 3,
    })
    const calm = await buildParkTransitRoute(providers, {
      ...base,
      congestionLevelAt: async () => null,
    })
    expect(busy.score).toBeGreaterThan(calm.score)
  })
})
