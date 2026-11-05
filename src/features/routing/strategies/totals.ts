import type { Leg, Totals } from '@shared/types'

/**
 * Leg[] 를 합산해 Totals 를 만든다. AGENTS.md 6장.
 * parkingCostPartial 은 주차비 정보 유무에 따라 상위(주차 로직)에서 지정한다.
 */
/**
 * 자차 구간들의 정체 운전 시간 합(분). 피로도의 운전 정체시간 입력. AGENTS.md 12장.
 * congestedDriveSec 이 없는 구간(대중교통·도보 등)은 0으로 취급한다.
 */
export function sumCongestedDriveMin(legs: Leg[]): number {
  return legs.reduce((s, l) => s + (l.congestedDriveSec ?? 0), 0) / 60
}

export function sumTotals(
  legs: Leg[],
  opts: { parkingCostPartial?: boolean } = {},
): Totals {
  return {
    durationSec: legs.reduce((s, l) => s + l.durationSec, 0),
    cost: legs.reduce((s, l) => s + l.cost, 0),
    walkDistanceM: legs.reduce((s, l) => s + l.walkDistanceM, 0),
    transfers: legs.reduce((s, l) => s + l.transfers, 0),
    fatigue: legs.reduce((s, l) => s + l.fatigue, 0),
    parkingCostPartial: opts.parkingCostPartial ?? false,
  }
}
