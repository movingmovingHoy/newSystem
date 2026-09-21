import { describe, it, expect } from 'vitest'
import { computeFatigue } from './fatigue'
import { FATIGUE_WEIGHTS } from '@shared/config'

/**
 * 피로도 = 도보거리×a + 환승횟수×b + 서서가는시간×c + 운전 정체시간×d
 * (AGENTS.md 12장, 가중치는 shared/config)
 */
describe('computeFatigue', () => {
  it('모든 항목이 0이면 피로도 0', () => {
    expect(
      computeFatigue({
        walkDistanceM: 0,
        transfers: 0,
        standingMin: 0,
        congestedDriveMin: 0,
      }),
    ).toBe(0)
  })

  it('각 항목에 config 가중치를 곱해 합산한다', () => {
    const input = {
      walkDistanceM: 500,
      transfers: 2,
      standingMin: 10,
      congestedDriveMin: 15,
    }
    const expected =
      500 * FATIGUE_WEIGHTS.walkPerMeter +
      2 * FATIGUE_WEIGHTS.perTransfer +
      10 * FATIGUE_WEIGHTS.perStandingMin +
      15 * FATIGUE_WEIGHTS.perCongestedDriveMin
    expect(computeFatigue(input)).toBeCloseTo(expected)
  })

  it('도보 거리가 길수록 피로도가 커진다', () => {
    const base = { transfers: 0, standingMin: 0, congestedDriveMin: 0 }
    const near = computeFatigue({ ...base, walkDistanceM: 100 })
    const far = computeFatigue({ ...base, walkDistanceM: 1000 })
    expect(far).toBeGreaterThan(near)
  })
})
