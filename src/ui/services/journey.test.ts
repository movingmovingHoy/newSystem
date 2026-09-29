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
    const draft = createInitialDraft() // 도착지 2개 (마지막이 종점)
    const orders = await service.order(draft)
    const ordered = orders[0].order
    // 앞쪽 도착지(비종점)만 주차가 필요하다. ordered[0] = 첫 방문 도착지.
    const firstWaypoint = draft.waypoints.find((w) => w.id === ordered[0])!
    const candidates = await service.parking(firstWaypoint)
    const unknown = candidates.find((l) => l.fee === null)!
    const result = await service.calculate(draft, ordered, {
      [ordered[0]]: unknown,
    })
    expect(result.order).toEqual(ordered)
    const car = result.routes.find((r) => r.scenario === 'car-direct')!
    expect(car.stops[0].parkingLotId).toBe(unknown.id)
    expect(car.totals.parkingCostPartial).toBe(true)
  })
  it('도착지가 1개면 주차 선택 없이 계산한다 (그 도착지가 종점)', async () => {
    const draft = createInitialDraft()
    draft.waypoints = [draft.waypoints[0]]
    const service = createJourneyService()
    const result = await service.calculate(draft, [draft.waypoints[0].id], {})
    expect(result.routes.length).toBeGreaterThan(0)
  })
  it('도착지가 없으면 계산하지 않는다 (최소 1개)', async () => {
    const draft = createInitialDraft()
    draft.waypoints = []
    await expect(
      createJourneyService().calculate(draft, [], {}),
    ).rejects.toThrow()
  })
  it('앞쪽 도착지의 주차 선택이 빠지면 계산하지 않는다', async () => {
    const draft = createInitialDraft() // 도착지 2개
    const order = draft.waypoints.map((w) => w.id)
    await expect(
      createJourneyService().calculate(draft, order, {}),
    ).rejects.toThrow()
  })
})
