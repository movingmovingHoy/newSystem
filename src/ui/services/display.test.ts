import { describe, expect, it } from 'vitest'
import { displayTimeline } from './display'
import {
  createInitialDraft,
  createJourneyService,
  departureIso,
} from './journey'

describe('여정 표시 시각', () => {
  it('자정을 넘어도 이동과 체류시간을 모두 누적한다', async () => {
    const draft = createInitialDraft()
    draft.departAt = '2026-09-27T23:50'
    const service = createJourneyService()
    const order = (await service.order(draft))[0].order
    const lot = (await service.parking(draft.waypoints[0]))[0]
    const result = await service.calculate(draft, order, { [order[0]]: lot })
    for (const route of result.routes) {
      const display = displayTimeline(route, draft)
      expect(
        Date.parse(display.finalArriveAt) - Date.parse(departureIso(draft)),
      ).toBe((route.totals.durationSec + 3600) * 1000)
      expect(
        Date.parse(display.visits[0].departAt) -
          Date.parse(display.visits[0].arriveAt),
      ).toBe(3600000)
    }
  })
  it('입력 시각을 한국 시간으로 해석한다', () => {
    const draft = createInitialDraft()
    draft.departAt = '2026-09-27T10:30'
    expect(departureIso(draft)).toBe('2026-09-27T01:30:00.000Z')
  })
})
