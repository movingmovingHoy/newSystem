import type { Scenario } from '@shared/types'
import {
  PREFERENCE_WEIGHTS,
  SCORE_SCALE,
  LEVEL_PENALTY,
  SCENARIO_SENSITIVITY,
  type Preference,
} from '@shared/config'

/**
 * 종합점수 계산. AGENTS.md 12장.
 * 종합점수(낮을수록 좋음) = 시간점수 + 비용점수 + 피로도점수 + 혼잡 감점
 * 앞의 세 항목에 성향 프리셋 가중치를 적용한다.
 * 혼잡 감점 = LEVEL_PENALTY[level] × SCENARIO_SENSITIVITY[scenario]
 *  - level=null 이면 감점 0, 화면에는 "혼잡: 정보 없음"
 * 종합점수만 주지 않고 항목별 분해와 근거 문구(reasons)를 함께 반환한다.
 */

export type ScoreInput = {
  scenario: Scenario
  /** 총 소요시간(초) */
  durationSec: number
  /** 총 비용(원). 교통비/통행료 (주차비 제외) */
  cost: number
  /** 피로도 0~100 (computeFatigue 결과) */
  fatigue: number
  /** 도착지 혼잡 단계. null = 정보 없음 */
  congestionLevel: number | null
  preference: Preference
}

export type ScoreBreakdown = {
  time: number
  cost: number
  fatigue: number
  congestion: number
}

export type ScoreResult = {
  /** 낮을수록 좋음 */
  score: number
  breakdown: ScoreBreakdown
  reasons: string[]
}

function congestionPenalty(
  level: number | null,
  scenario: Scenario,
): number {
  if (level === null) return 0
  const base = LEVEL_PENALTY[level] ?? 0
  return base * SCENARIO_SENSITIVITY[scenario]
}

export function scoreRoute(input: ScoreInput): ScoreResult {
  const w = PREFERENCE_WEIGHTS[input.preference]

  const timeScore =
    (input.durationSec / 60) * SCORE_SCALE.timePerMinute * w.time
  const costScore = (input.cost / 100) * SCORE_SCALE.costPer100Won * w.cost
  const fatigueScore = input.fatigue * SCORE_SCALE.fatigueWeight * w.fatigue
  const congestion = congestionPenalty(input.congestionLevel, input.scenario)

  const breakdown: ScoreBreakdown = {
    time: timeScore,
    cost: costScore,
    fatigue: fatigueScore,
    congestion,
  }
  const score = timeScore + costScore + fatigueScore + congestion

  return { score, breakdown, reasons: buildReasons(input, breakdown) }
}

function buildReasons(
  input: ScoreInput,
  breakdown: ScoreBreakdown,
): string[] {
  const reasons: string[] = []

  reasons.push(`이동시간 약 ${Math.round(input.durationSec / 60)}분`)
  reasons.push(`비용 ${input.cost.toLocaleString()}원`)

  if (input.fatigue >= 50) {
    reasons.push('피로도가 높은 편')
  } else if (input.fatigue <= 15) {
    reasons.push('피로도가 낮은 편')
  }

  if (input.congestionLevel === null) {
    reasons.push('도착지 혼잡: 정보 없음')
  } else if (breakdown.congestion > 0) {
    const label = input.scenario === 'car-direct' ? '자차 ' : ''
    reasons.push(`도착지 혼잡으로 ${label}감점`)
  } else {
    reasons.push('도착지 혼잡 여유')
  }

  return reasons
}
