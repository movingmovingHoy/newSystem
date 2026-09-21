import { describe, it, expect } from 'vitest'
import { buildTransitOnlyRoute } from './transit-only'
import { sumTotals } from './totals'
import type { RouteProvider, RouteQuery } from '../providers'
import type { Leg, Waypoint } from '@shared/types'

const origin = { lat: 37.5547, lng: 126.9707 }
const destination = { lat: 37.4979, lng: 127.0276 }

function makeTransitProvider(perLegSec = 600): RouteProvider {
  return {
    mode: 'transit',
    async route(q: RouteQuery): Promise<Leg[]> {
      return [
        {
          mode: 'subway',
          from: q.from,
          to: q.to,
          departAt: q.departAt ?? new Date().toISOString(),
          arriveAt: q.departAt ?? new Date().toISOString(),
          durationSec: perLegSec,
          cost: 1400,
          walkDistanceM: 200,
          transfers: 1,
          fatigue: 0,
        },
      ]
    },
  }
}

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

describe('sumTotals', () => {
  it('leg 속성을 합산한다', () => {
    const legs: Leg[] = [
      {
        mode: 'subway',
        from: origin,
        to: destination,
        departAt: '',
        arriveAt: '',
        durationSec: 600,
        cost: 1400,
        walkDistanceM: 200,
        transfers: 1,
        fatigue: 5,
      },
      {
        mode: 'walk',
        from: origin,
        to: destination,
        departAt: '',
        arriveAt: '',
        durationSec: 300,
        cost: 0,
        walkDistanceM: 400,
        transfers: 0,
        fatigue: 8,
      },
    ]
    const t = sumTotals(legs)
    expect(t.durationSec).toBe(900)
    expect(t.cost).toBe(1400)
    expect(t.walkDistanceM).toBe(600)
    expect(t.transfers).toBe(1)
    expect(t.parkingCostPartial).toBe(false)
  })
})

describe('buildTransitOnlyRoute', () => {
  it('경유지 2개면 3구간을 대중교통으로 이어 붙이고 timeline/totals를 만든다', async () => {
    const provider = makeTransitProvider(600) // 각 구간 10분
    const route = await buildTransitOnlyRoute(provider, {
      origin,
      destination,
      orderedWaypoints: [wp('A', 37.52, 127.0, 30), wp('B', 37.51, 127.01, 45)],
      departAt: '2026-09-21T09:00:00.000Z',
      preference: 'time',
    })

    expect(route.scenario).toBe('transit-only')
    // 3구간 → leg 3개
    expect(route.legs).toHaveLength(3)
    // 경유지 2개 → stop 2개
    expect(route.stops).toHaveLength(2)
    // 총 이동시간 = 600 * 3
    expect(route.totals.durationSec).toBe(1800)
    // 비용 = 1400 * 3 (요약형 기본요금이 구간마다)
    expect(route.totals.cost).toBe(4200)
    expect(route.score).toBeGreaterThan(0)
    expect(route.stops[0].accessMode).toBe('transit')
  })

  it('타임라인이 체류시간을 누적한다 (경유지 도착/출발 시각)', async () => {
    const provider = makeTransitProvider(600)
    const route = await buildTransitOnlyRoute(provider, {
      origin,
      destination,
      orderedWaypoints: [wp('A', 37.52, 127.0, 30)],
      departAt: '2026-09-21T09:00:00.000Z',
      preference: 'time',
    })
    // 09:00 + 10분 = 09:10 도착, +30분 체류 = 09:40 출발
    expect(route.stops[0].arriveAt).toBe('2026-09-21T09:10:00.000Z')
    expect(route.stops[0].departAt).toBe('2026-09-21T09:40:00.000Z')
  })

  it('혼잡도 조회 함수가 있으면 도착지 혼잡을 점수에 반영한다', async () => {
    const provider = makeTransitProvider(600)
    const withCongestion = await buildTransitOnlyRoute(provider, {
      origin,
      destination,
      orderedWaypoints: [wp('A', 37.52, 127.0, 30)],
      departAt: '2026-09-21T09:00:00.000Z',
      preference: 'time',
      congestionLevelAt: async () => 3, // 붐빔
    })
    const noCongestion = await buildTransitOnlyRoute(provider, {
      origin,
      destination,
      orderedWaypoints: [wp('A', 37.52, 127.0, 30)],
      departAt: '2026-09-21T09:00:00.000Z',
      preference: 'time',
      congestionLevelAt: async () => null,
    })
    // 혼잡 있으면 점수가 더 높다(나쁨). transit-only 민감도가 낮아도 0보다는 큼
    expect(withCongestion.score).toBeGreaterThan(noCongestion.score)
    expect(withCongestion.stops[0].congestion.level).toBe(3)
  })
})
