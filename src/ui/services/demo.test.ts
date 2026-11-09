import { describe, expect, it } from 'vitest'
import {
  createDemoJourneyService,
  demoCongestionLevelAt,
  demoOccupancyAt,
  isDemoMode,
  searchDemoPlaces,
} from './demo'
import { createInitialDraft } from './journey'
import { parkingPressureView } from './display'

describe('isDemoMode', () => {
  it('--mode demo 이거나 VITE_DEMO=true 일 때만 켜진다', () => {
    expect(isDemoMode({ MODE: 'demo' })).toBe(true)
    expect(isDemoMode({ MODE: 'development', VITE_DEMO: 'true' })).toBe(true)
    expect(isDemoMode({ MODE: 'development' })).toBe(false)
    expect(isDemoMode({ MODE: 'production', VITE_DEMO: 'false' })).toBe(false)
  })
})

describe('searchDemoPlaces (API 없이 장소 검색)', () => {
  it('샘플 장소와 서울 주요 121곳에서 찾는다', () => {
    const names = searchDemoPlaces('시청').map((p) => p.name)
    expect(names).toContain('서울시청')
    expect(searchDemoPlaces('강남').length).toBeGreaterThan(0)
  })

  it('같은 이름은 한 번만 나온다', () => {
    const names = searchDemoPlaces('서울역').map((p) => p.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('결과가 없으면 빈 목록이다', () => {
    expect(searchDemoPlaces('zzzzzz없는곳')).toEqual([])
  })
})

describe('데모용 샘플 데이터', () => {
  it('주차 포화율은 같은 위치에 항상 같은 값이고 0~1 사이다', async () => {
    const gangnam = { lat: 37.498, lng: 127.0276 }
    const a = await demoOccupancyAt(gangnam)
    const b = await demoOccupancyAt(gangnam)
    expect(a).toEqual(b)
    expect(a!.ratio).toBeGreaterThan(0)
    expect(a!.ratio).toBeLessThanOrEqual(1)
  })

  it('강남역 주변은 붐비고 시청 주변은 여유롭다', async () => {
    const gangnam = await demoOccupancyAt({ lat: 37.498, lng: 127.0276 })
    const cityhall = await demoOccupancyAt({ lat: 37.5665, lng: 126.978 })
    expect(gangnam!.ratio).toBeGreaterThanOrEqual(0.7)
    expect(cityhall!.ratio).toBeLessThan(0.5)
  })

  it('121곳 밖이면 혼잡도 정보 없음(null)이다', async () => {
    const outside = { lat: 37.7, lng: 127.3 }
    expect(await demoCongestionLevelAt(outside, new Date())).toBeNull()
  })

  it('121곳 안이면 0~3 단계를 준다', async () => {
    const level = await demoCongestionLevelAt(
      { lat: 37.498, lng: 127.0276 },
      new Date('2026-11-09T05:00:00.000Z'), // KST 14시
    )
    expect(level).not.toBeNull()
    expect(level!).toBeGreaterThanOrEqual(0)
    expect(level!).toBeLessThanOrEqual(3)
  })
})

describe('데모 서비스: 키 없이 끝까지 계산된다', () => {
  it('기본 입력으로 세 시나리오와 주차 혼잡 근거가 나온다', async () => {
    const service = createDemoJourneyService()
    const draft = createInitialDraft()
    const order = (await service.order(draft))[0].order
    const lot = (await service.parking(draft.waypoints[0]))[0]
    const result = await service.calculate(draft, order, { [order[0]]: lot })

    const scenarios = result.routes.map((r) => r.scenario).sort()
    expect(scenarios).toEqual(['car-direct', 'park-transit', 'transit-only'])

    const parkTransit = result.routes.find(
      (r) => r.scenario === 'park-transit',
    )!
    const view = parkingPressureView(parkTransit)
    expect(view).not.toBeNull()
    expect(view!.percent).toBeGreaterThanOrEqual(70)
  })

  it('대중교통 경로에 구간 상세(도보·지하철)가 들어 있다', async () => {
    const service = createDemoJourneyService()
    const draft = createInitialDraft()
    const order = (await service.order(draft))[0].order
    const lot = (await service.parking(draft.waypoints[0]))[0]
    const result = await service.calculate(draft, order, { [order[0]]: lot })
    const transit = result.routes.find((r) => r.scenario === 'transit-only')!
    const steps = transit.legs.flatMap((l) => l.transitDetail ?? [])
    expect(steps.map((s) => s.type)).toContain('subway')
    expect(steps.map((s) => s.type)).toContain('walk')
  })

  it('자차 경로에 정체 시간이 들어 있다', async () => {
    const service = createDemoJourneyService()
    const draft = createInitialDraft()
    const order = (await service.order(draft))[0].order
    const lot = (await service.parking(draft.waypoints[0]))[0]
    const result = await service.calculate(draft, order, { [order[0]]: lot })
    const car = result.routes.find((r) => r.scenario === 'car-direct')!
    const congested = car.legs.reduce(
      (s, l) => s + (l.congestedDriveSec ?? 0),
      0,
    )
    expect(congested).toBeGreaterThan(0)
  })
})
