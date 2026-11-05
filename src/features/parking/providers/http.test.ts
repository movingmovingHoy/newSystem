import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpParkingProvider } from './http'
afterEach(() => vi.unstubAllGlobals())
describe('실제 주차장 브라우저 provider', () => {
  it('키 없이 로컬 API의 데이터를 사용한다', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ lots: [{ id: 'ts:1', name: '실제 공영주차장' }] }),
      })
    vi.stubGlobal('fetch', fetcher)
    const lots = await new HttpParkingProvider().search({
      center: { lat: 37.57, lng: 126.98 },
      radiusM: 1000,
    })
    expect(lots[0].id).toBe('ts:1')
    expect(fetcher.mock.calls[0][0]).toBe(
      '/api/parking?lat=37.57&lng=126.98&radiusM=1000',
    )
  })
  it('조회 실패를 샘플로 대체하지 않는다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    )
    await expect(
      new HttpParkingProvider().search({
        center: { lat: 37.57, lng: 126.98 },
        radiusM: 1000,
      }),
    ).rejects.toThrow('불러오지 못했습니다')
  })
})
