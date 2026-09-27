import { describe, it, expect } from 'vitest'
import { rankRoutes } from './ranking'
import type { Route, Scenario, Totals } from '@shared/types'

function route(
  scenario: Scenario,
  score: number,
  totals: Partial<Totals>,
): Route {
  return {
    scenario,
    legs: [],
    stops: [],
    totals: {
      durationSec: 0,
      cost: 0,
      walkDistanceM: 0,
      transfers: 0,
      fatigue: 0,
      parkingCostPartial: false,
      ...totals,
    },
    score,
    reasons: [],
  }
}

// 서로 다른 강점을 가진 세 경로
const carDirect = route('car-direct', 80, {
  durationSec: 1800, // 가장 빠름
  cost: 5000, // 비쌈
  walkDistanceM: 100, // 도보 적음
})
const mixed = route('mixed', 60, {
  durationSec: 2400,
  cost: 2000,
  walkDistanceM: 600,
})
const transit = route('transit-only', 70, {
  durationSec: 3000, // 느림
  cost: 1400, // 가장 쌈
  walkDistanceM: 900, // 도보 많음
})
const all = [carDirect, mixed, transit]

describe('rankRoutes', () => {
  it('recommended: score 오름차순 (낮을수록 좋음)', () => {
    const r = rankRoutes(all, 'recommended')
    expect(r.map((x) => x.scenario)).toEqual([
      'mixed',
      'transit-only',
      'car-direct',
    ])
  })

  it('fastest: 소요시간 짧은순', () => {
    const r = rankRoutes(all, 'fastest')
    expect(r[0].scenario).toBe('car-direct') // 1800초
    expect(r[2].scenario).toBe('transit-only') // 3000초
  })

  it('cheapest: 비용 싼순', () => {
    const r = rankRoutes(all, 'cheapest')
    expect(r[0].scenario).toBe('transit-only') // 1400원
    expect(r[2].scenario).toBe('car-direct') // 5000원
  })

  it('leastWalk: 도보 적은순', () => {
    const r = rankRoutes(all, 'leastWalk')
    expect(r[0].scenario).toBe('car-direct') // 100m
    expect(r[2].scenario).toBe('transit-only') // 900m
  })

  it('원본 배열을 변형하지 않는다', () => {
    const before = all.map((x) => x.scenario)
    rankRoutes(all, 'fastest')
    expect(all.map((x) => x.scenario)).toEqual(before)
  })

  it('동점이면 추천 점수로 2차 정렬한다', () => {
    const a = route('car-direct', 90, { durationSec: 1000 })
    const b = route('mixed', 50, { durationSec: 1000 }) // 같은 시간, 더 좋은 점수
    const r = rankRoutes([a, b], 'fastest')
    expect(r[0].scenario).toBe('mixed')
  })
})
