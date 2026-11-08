import { describe, expect, it } from 'vitest'
import { placeById } from './catalog'
import { displayTimeline } from './display'
import { journeyEvents } from './journeyEvents'
import { createInitialDraft, createJourneyService } from './journey'

async function setup() {
  const draft = createInitialDraft()
  const service = createJourneyService()
  const order = (await service.order(draft))[0].order
  const lot = (await service.parking(draft.waypoints[0]))[0]
  const result = await service.calculate(draft, order, { [order[0]]: lot })
  return { draft, order, lot, result }
}

describe('journeyEvents (이동 순서대로 보여주기)', () => {
  it('자차: 출발 → 차 이동 → 주차 → 도보 → 체류 → 도보 복귀 → 차 이동 → 도착', async () => {
    const { draft, order, lot, result } = await setup()
    const car = result.routes.find((r) => r.scenario === 'car-direct')!
    const events = journeyEvents(car, draft, { [order[0]]: lot })
    expect(events.map((e) => e.kind)).toEqual([
      'start',
      'drive',
      'park',
      'walk',
      'stay',
      'walk',
      'drive',
      'end',
    ])
    const walks = events.filter((e) => e.kind === 'walk')
    expect(walks.map((e) => e.kind === 'walk' && e.direction)).toEqual([
      'out',
      'back',
    ])
  })

  it('주차 이벤트에 선택한 주차장 이름과 요금이 실린다', async () => {
    const { draft, order, lot, result } = await setup()
    const car = result.routes.find((r) => r.scenario === 'car-direct')!
    const park = journeyEvents(car, draft, { [order[0]]: lot }).find(
      (e) => e.kind === 'park',
    )
    expect(park).toMatchObject({ name: lot.name, fee: car.stops[0].parkingFee })
  })

  it('시각이 순서대로 늘어나고 마지막 도착 시각은 displayTimeline과 같다', async () => {
    const { draft, order, lot, result } = await setup()
    for (const route of result.routes.filter(
      (r) => r.scenario !== 'transit-only',
    )) {
      const events = journeyEvents(route, draft, { [order[0]]: lot })
      const times = events.map((e) => Date.parse(e.at))
      expect(times).toEqual([...times].sort((a, b) => a - b))
      expect(events.at(-1)!.at).toBe(
        displayTimeline(route, draft, { [order[0]]: lot }).finalArriveAt,
      )
    }
  })

  it('체류 이벤트는 체류시간만큼 뒤에 출발한다', async () => {
    const { draft, order, lot, result } = await setup()
    const car = result.routes.find((r) => r.scenario === 'car-direct')!
    const stay = journeyEvents(car, draft, { [order[0]]: lot }).find(
      (e) => e.kind === 'stay',
    )!
    expect(stay.kind === 'stay' && stay.dwellMin).toBe(
      draft.waypoints.find((w) => w.id === order[0])!.dwellMin,
    )
    expect(
      stay.kind === 'stay' && Date.parse(stay.departAt) - Date.parse(stay.at),
    ).toBe(60 * 60_000)
  })

  it('주차 후 대중교통: 출발 → 차 이동 → 주차 → 체류 → 대중교통 → 도착', async () => {
    const { draft, order, lot, result } = await setup()
    const pt = result.routes.find((r) => r.scenario === 'park-transit')!
    const events = journeyEvents(pt, draft, { [order[0]]: lot })
    expect(events.map((e) => e.kind)).toEqual([
      'start',
      'drive',
      'park',
      'stay',
      'transit',
      'end',
    ])
  })

  it('마지막 이벤트는 종점 이름이다 (경유 도착지가 아닌 쪽)', async () => {
    const { draft, order, lot, result } = await setup()
    const car = result.routes.find((r) => r.scenario === 'car-direct')!
    const end = journeyEvents(car, draft, { [order[0]]: lot }).at(-1)!
    const endpoint = draft.waypoints.find((w) => w.id === order.at(-1))!
    expect(end).toMatchObject({
      kind: 'end',
      name: placeById(endpoint.placeId).name,
    })
  })

  it('대중교통만 경로는 이 목록을 쓰지 않는다', async () => {
    const { draft, result } = await setup()
    const transit = result.routes.find((r) => r.scenario === 'transit-only')!
    expect(journeyEvents(transit, draft)).toEqual([])
  })

  it('주차장을 고르지 않았으면 주차 이름은 null이다', async () => {
    const { draft, result } = await setup()
    const car = result.routes.find((r) => r.scenario === 'car-direct')!
    const park = journeyEvents(car, draft).find((e) => e.kind === 'park')
    expect(park).toMatchObject({ name: null })
  })
})
