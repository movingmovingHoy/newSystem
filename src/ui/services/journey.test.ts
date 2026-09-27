import { describe, expect, it } from 'vitest'
import {
  createJourneyService,
  createInitialDraft,
  validateDraft,
} from './journey'
import { places } from './places'

describe('화면과 경로 플래너 연결', () => {
  it('체류 0분은 그대로 허용하고 음수와 고정 순번 중복은 거절한다', () => {
    const draft = createInitialDraft()
    draft.waypoints[0].dwellMin = 0
    expect(() => validateDraft(draft)).not.toThrow()
    draft.waypoints[0].dwellMin = -1
    expect(() => validateDraft(draft)).toThrow()
    draft.waypoints = [
      { id: 'a', placeId: places[1].id, dwellMin: 60, fixedIndex: 0 },
      { id: 'b', placeId: places[2].id, dwellMin: 60, fixedIndex: 0 },
    ]
    expect(() => validateDraft(draft)).toThrow()
  })
  it('고른 순서와 주차장을 경로 계산에 전달하고 정보 없음을 보존한다', async () => {
    const service = createJourneyService()
    const draft = createInitialDraft()
    const orders = await service.order(draft)
    const ordered = orders[0].order
    const candidates = await service.parking(draft.waypoints[0])
    const unknown = candidates.find((l) => l.fee === null)!
    const result = await service.calculate(draft, ordered, {
      [ordered[0]]: unknown,
    })
    expect(result.order).toEqual(ordered)
    const car = result.routes.find((r) => r.scenario === 'car-direct')!
    expect(car.stops[0].parkingLotId).toBe(unknown.id)
    expect(car.totals.parkingCostPartial).toBe(true)
  })
  it('경유지가 없으면 주차 선택 없이 계산한다', async () => {
    const draft = createInitialDraft()
    draft.waypoints = []
    const service = createJourneyService()
    expect(
      (await service.calculate(draft, [], {})).routes.length,
    ).toBeGreaterThan(0)
  })
  it('주차 선택이 빠진 상태에서 계산하지 않는다', async () => {
    const draft = createInitialDraft()
    await expect(
      createJourneyService().calculate(draft, [draft.waypoints[0].id], {}),
    ).rejects.toThrow()
  })
})
