import { FATIGUE_WEIGHTS } from '@shared/config'

/**
 * 피로도 계산. AGENTS.md 12장.
 * 피로도 = 도보거리×a + 환승횟수×b + 서서가는시간×c + 운전 정체시간×d
 * 가중치는 shared/config 의 FATIGUE_WEIGHTS.
 */

export type FatigueInput = {
  /** 총 도보 거리 (m) */
  walkDistanceM: number
  /** 총 환승 횟수 */
  transfers: number
  /** 서서 가는 시간 (분). 대중교통 입석 등 */
  standingMin: number
  /** 운전 중 정체 시간 (분) */
  congestedDriveMin: number
}

export function computeFatigue(input: FatigueInput): number {
  return (
    input.walkDistanceM * FATIGUE_WEIGHTS.walkPerMeter +
    input.transfers * FATIGUE_WEIGHTS.perTransfer +
    input.standingMin * FATIGUE_WEIGHTS.perStandingMin +
    input.congestedDriveMin * FATIGUE_WEIGHTS.perCongestedDriveMin
  )
}
