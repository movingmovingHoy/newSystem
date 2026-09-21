import type { Leg, Totals } from '@shared/types'

/**
 * Leg[] 를 합산해 Totals 를 만든다. AGENTS.md 6장.
 * parkingCostPartial 은 주차비 정보 유무에 따라 상위(주차 로직)에서 지정한다.
 */
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
