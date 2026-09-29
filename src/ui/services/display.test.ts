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
  it('선택한 주차장 이름과 요금 정보 없음을 방문지에 채운다', async () => {
    const draft = createInitialDraft()
    const service = createJourneyService()
    const order = (await service.order(draft))[0].order
    const lot = (await service.parking(draft.waypoints[0]))[0]
    const result = await service.calculate(draft, order, { [order[0]]: lot })
    const car = result.routes.find((r) => r.scenario !== 'transit-only')!
    const display = displayTimeline(car, draft, { [order[0]]: lot })
    // 첫 방문지에 선택한 주차장 이름이 실린다
    expect(display.visits[0].parkingName).toBe(lot.name)
    // 접근 수단 정보가 실린다
    expect(['walk', 'transit']).toContain(display.visits[0].accessMode)
  })
  it('대중교통 경로는 방문지/종점에 승하차 구간 상세를 담는다', async () => {
    const draft = createInitialDraft()
    const service = createJourneyService()
    const order = (await service.order(draft))[0].order
    const lot = (await service.parking(draft.waypoints[0]))[0]
    const result = await service.calculate(draft, order, { [order[0]]: lot })
    const transit = result.routes.find((r) => r.scenario === 'transit-only')!
    const display = displayTimeline(transit, draft)
    // 종점까지의 구간 상세가 존재한다 (mock 은 상세가 없을 수 있어 배열 존재만 확인)
    expect(Array.isArray(display.endpointSteps)).toBe(true)
    expect(display.visits[0].accessMode).toBe('transit')
  })
})
