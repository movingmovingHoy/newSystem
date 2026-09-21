import { describe, it, expect } from 'vitest'
import { scoreRoute } from './scoring'
import type { ScoreInput } from './scoring'

/**
 * 종합점수(낮을수록 좋음) = 시간 + 비용 + 피로도 (성향 가중치 적용) + 혼잡 감점
 * (AGENTS.md 12장)
 */

const base: ScoreInput = {
  scenario: 'car-direct',
  durationSec: 30 * 60, // 30분
  cost: 2000, // 2000원
  fatigue: 20,
  congestionLevel: null,
  preference: 'time',
}

describe('scoreRoute', () => {
  it('낮을수록 좋은 종합점수와 항목별 분해를 반환한다', () => {
    const r = scoreRoute(base)
    expect(r.score).toBeGreaterThan(0)
    expect(r.breakdown.time).toBeGreaterThan(0)
    expect(r.breakdown.cost).toBeGreaterThan(0)
    expect(r.breakdown.fatigue).toBeGreaterThan(0)
    expect(r.breakdown.congestion).toBe(0) // level null
  })

  it('성향 프리셋에 따라 항목 비중이 달라진다 (시간 우선 vs 비용 우선)', () => {
    // 시간은 짧지만 비용이 비싼 경로
    const fastPricey: ScoreInput = {
      ...base,
      durationSec: 20 * 60,
      cost: 8000,
      congestionLevel: null,
    }
    // 시간은 길지만 저렴한 경로
    const slowCheap: ScoreInput = {
      ...base,
      durationSec: 50 * 60,
      cost: 500,
      congestionLevel: null,
    }

    const timePref = {
      fast: scoreRoute({ ...fastPricey, preference: 'time' }).score,
      slow: scoreRoute({ ...slowCheap, preference: 'time' }).score,
    }
    const costPref = {
      fast: scoreRoute({ ...fastPricey, preference: 'cost' }).score,
      slow: scoreRoute({ ...slowCheap, preference: 'cost' }).score,
    }

    // 시간 우선: 빠른 경로가 더 좋아야(점수 낮아야) 한다
    expect(timePref.fast).toBeLessThan(timePref.slow)
    // 비용 우선: 저렴한 경로가 더 좋아야 한다
    expect(costPref.slow).toBeLessThan(costPref.fast)
  })

  it('level=null이면 혼잡 감점이 0이고 근거에 정보 없음이 뜬다', () => {
    const r = scoreRoute({ ...base, congestionLevel: null })
    expect(r.breakdown.congestion).toBe(0)
    expect(r.reasons.some((x) => x.includes('정보 없음'))).toBe(true)
  })

  it('같은 혼잡 단계라도 시나리오 민감도에 따라 감점이 다르다', () => {
    const car = scoreRoute({
      ...base,
      scenario: 'car-direct',
      congestionLevel: 3,
    })
    const transit = scoreRoute({
      ...base,
      scenario: 'transit-only',
      congestionLevel: 3,
    })
    // 자차가 붐빔에 더 민감 → 감점이 더 크다
    expect(car.breakdown.congestion).toBeGreaterThan(
      transit.breakdown.congestion,
    )
  })

  it('여유/보통 단계(0,1)는 혼잡 감점이 0이다', () => {
    expect(scoreRoute({ ...base, congestionLevel: 0 }).breakdown.congestion).toBe(
      0,
    )
    expect(scoreRoute({ ...base, congestionLevel: 1 }).breakdown.congestion).toBe(
      0,
    )
  })

  it('혼잡 감점이 있으면 근거 문구에 혼잡 관련 설명이 들어간다', () => {
    const r = scoreRoute({
      ...base,
      scenario: 'car-direct',
      congestionLevel: 3,
    })
    expect(r.breakdown.congestion).toBeGreaterThan(0)
    expect(r.reasons.some((x) => x.includes('혼잡'))).toBe(true)
  })
})
