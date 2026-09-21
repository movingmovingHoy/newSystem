import type { Scenario } from '../types'

/**
 * 점수 가중치와 감점. AGENTS.md 12장. 전부 튜닝 대상이므로 기본값만 둔다.
 */

/** 성향 프리셋 가중치. 시간/비용/피로도 점수에 곱한다. */
export type Preference = 'time' | 'cost' | 'lowStamina'

export const PREFERENCE_WEIGHTS: Record<
  Preference,
  { time: number; cost: number; fatigue: number }
> = {
  time: { time: 1.5, cost: 0.7, fatigue: 0.8 },
  cost: { time: 0.7, cost: 1.5, fatigue: 0.8 },
  lowStamina: { time: 0.8, cost: 0.8, fatigue: 1.5 },
}

/**
 * 피로도 가중치. 피로도 = 도보거리×a + 환승횟수×b + 서서가는시간×c + 정체시간×d
 */
export const FATIGUE_WEIGHTS = {
  /** a: 도보 1m 당 */
  walkPerMeter: 0.02,
  /** b: 환승 1회 당 */
  perTransfer: 5,
  /** c: 서서 가는 시간 1분 당 */
  perStandingMin: 0.5,
  /** d: 운전 정체 1분 당 */
  perCongestedDriveMin: 0.8,
} as const

/**
 * 혼잡 단계별 감점. 도착 시각 예측값의 단계 인덱스로 조회.
 * 단계: 0 여유, 1 보통, 2 약간 붐빔, 3 붐빔 (config에서 관리, 튜닝 대상)
 * level=null 이면 감점 0 (조회 자체를 하지 않음).
 */
export const LEVEL_PENALTY: readonly number[] = [0, 0, 5, 10]

/** 시나리오 민감도. 붐빌수록 자차 감점이 더 커진다. */
export const SCENARIO_SENSITIVITY: Record<Scenario, number> = {
  'car-direct': 1.0,
  mixed: 0.6,
  'transit-only': 0.3,
}
