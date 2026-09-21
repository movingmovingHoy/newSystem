import { describe, it, expect } from 'vitest'
import { summarizeRoutes } from './summary'
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

describe('summarizeRoutes', () => {
  it('1위가 2위보다 빠르고 싸면 그걸 문장으로 만든다', () => {
    const r = summarizeRoutes([
      route('transit-only', 50, { durationSec: 1800, cost: 1400 }),
      route('car-direct', 80, { durationSec: 2400, cost: 5000 }),
    ])
    expect(r.headline).toContain('대중교통')
    expect(r.details.some((d) => d.includes('빠릅니다'))).toBe(true)
    expect(r.details.some((d) => d.includes('저렴합니다'))).toBe(true)
  })

  it('1위가 시간은 느리지만 종합이 좋으면 그걸 설명한다', () => {
    const r = summarizeRoutes([
      route('transit-only', 50, { durationSec: 3000, cost: 1400 }),
      route('car-direct', 80, { durationSec: 1800, cost: 8000 }),
    ])
    expect(r.details.some((d) => d.includes('더 걸리지만'))).toBe(true)
  })

  it('경로가 없으면 기본 메시지', () => {
    const r = summarizeRoutes([])
    expect(r.headline).toContain('없습니다')
  })

  it('경로가 하나면 요약만', () => {
    const r = summarizeRoutes([
      route('car-direct', 50, { durationSec: 1800, cost: 3000 }),
    ])
    expect(r.headline).toContain('자차')
    expect(r.details[0]).toContain('30분')
  })
})
