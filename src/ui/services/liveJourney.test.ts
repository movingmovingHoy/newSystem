import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveDraft, createLiveJourneyService } from './liveJourney'
import { registerPlace } from './catalog'
afterEach(() => vi.unstubAllGlobals())
describe('실제 provider와 플래너 연결 (외부 응답 mock)', () => {
  it('API의 시간·요금을 결과에 사용하고 선택한 출발 좌표를 보낸다', async () => {
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
      urls.some((url) => url.includes('SX=126.98') && url.includes('SY=37.56')),
    ).toBe(true)
    expect(urls.some((url) => url.startsWith('/api/seoul/'))).toBe(true)
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
