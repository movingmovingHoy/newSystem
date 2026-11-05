import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveDraft, createLiveJourneyService } from './liveJourney'
import { registerPlace } from './catalog'
afterEach(() => vi.unstubAllGlobals())
describe('실제 provider와 플래너 연결 (외부 응답 mock)', () => {
  it.each([
    { destination: { lat: 37.510897, lng: 127.059949 }, congestion: true },
    { destination: { lat: 37.63, lng: 126.97 }, congestion: false },
  ])(
    '실제 출발·도착 좌표와 혼잡 영역 여부를 반영한다: $congestion',
    async ({ destination, congestion }) => {
      const fetch = vi.fn(async (url: string) => {
        if (url.startsWith('/api/kakao/navi'))
          return {
            ok: true,
            json: async () => ({
              routes: [
                {
                  result_code: 0,
                  summary: {
                    duration: 1234,
                    distance: 10000,
                    fare: { toll: 700 },
                  },
                },
              ],
            }),
          }
        if (url.startsWith('/api/odsay/'))
          return {
            ok: true,
            json: async () => ({
              result: {
                path: [
                  {
                    pathType: 1,
                    info: {
                      totalTime: 37,
                      payment: 1750,
                      totalWalk: 123,
                      subwayTransitCount: 1,
                    },
                  },
                ],
              },
            }),
          }
        if (url.startsWith('/api/seoul/'))
          return {
            ok: true,
            text: async () =>
              '<Map><SeoulRtd.citydata_ppltn><AREA_CD>POI014</AREA_CD><AREA_CONGEST_LVL>보통</AREA_CONGEST_LVL><FCST_YN>N</FCST_YN></SeoulRtd.citydata_ppltn></Map>',
          }
        throw new Error('예상하지 않은 API')
      })
      vi.stubGlobal('fetch', fetch)
      const draft = createLiveDraft()
      draft.originId = registerPlace({
        name: '검색 출발지',
        address: '서울',
        location: { lat: 37.56, lng: 126.98 },
      }).id
      draft.waypoints[0].placeId = registerPlace({
        name: '검색한 건물',
        address: '서울특별시',
        location: destination,
      }).id
      const service = createLiveJourneyService()
      const order = (await service.order(draft))[0].order
      const result = await service.calculate(draft, order, {})
      const car = result.routes.find((r) => r.scenario === 'car-direct')!
      const transit = result.routes.find((r) => r.scenario === 'transit-only')!
      expect(car.totals.durationSec).toBe(1234)
      expect(car.totals.cost).toBe(700)
      expect(transit.totals.durationSec).toBe(37 * 60)
      expect(transit.totals.cost).toBe(1750)
      const urls = fetch.mock.calls.map(([url]) => decodeURIComponent(url))
      expect(
        urls.some(
          (url) => url.includes('SX=126.98') && url.includes('SY=37.56'),
        ),
      ).toBe(true)
      expect(
        urls.some(
          (url) =>
            url.includes(`EX=${destination.lng}`) &&
            url.includes(`EY=${destination.lat}`),
        ),
      ).toBe(true)
      expect(urls.some((url) => url.startsWith('/api/seoul/'))).toBe(congestion)
      if (!congestion) expect(car.reasons).toContain('도착지 혼잡: 정보 없음')
    },
  )
  it('실제 주차장 API 결과를 후보 선정에 연결한다', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        lots: [
          {
            id: 'ts:actual',
            name: '실제 공영주차장',
            location: { lat: 37.5, lng: 127 },
            fee: null,
            distanceToWaypointM: 120,
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetcher)
    const draft = createLiveDraft()
    draft.waypoints[0].placeId = registerPlace({
      name: '선택한 카페',
      address: '서울',
      location: { lat: 37.544, lng: 127.055 },
    }).id
    const lots = await createLiveJourneyService().parking(draft.waypoints[0])
    expect(lots[0].id).toBe('ts:actual')
    expect(lots[0].fee).toBeNull()
    const url = new URL(fetcher.mock.calls[0][0], 'http://localhost')
    expect(url.pathname).toBe('/api/parking')
    expect(url.searchParams.get('lat')).toBe('37.544')
    expect(url.searchParams.get('lng')).toBe('127.055')
  })
  it('인증 오류가 발생하면 mock 경로로 대체하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401 }),
    )
    await expect(
      createLiveJourneyService().order(createLiveDraft()),
    ).rejects.toThrow()
  })
})
