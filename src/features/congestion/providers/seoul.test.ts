import { describe, it, expect, vi, afterEach } from 'vitest'
import { SeoulCongestionProvider } from './seoul'

/**
 * 실제 서울 실시간 도시데이터 provider.
 * dev 프록시(/api/seoul/...)로 XML을 받아 그대로 반환한다.
 * 테스트에서는 fetch를 mock으로 갈아끼운다.
 */

function mockFetchOnce(body: string, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    text: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('SeoulCongestionProvider', () => {
  it('areaCode를 장소명으로 바꿔 프록시 경로로 요청하고 XML을 반환한다', async () => {
    const xml =
      '<Map><SeoulRtd.citydata_ppltn><AREA_CD>POI001</AREA_CD></SeoulRtd.citydata_ppltn></Map>'
    const fetchMock = mockFetchOnce(xml)

    const result = await new SeoulCongestionProvider().fetchRaw('POI001')

    expect(result).toBe(xml)
    const url = fetchMock.mock.calls[0][0] as string
    // dev 프록시 경로 + citydata_ppltn 사용
    expect(url).toContain('/api/seoul/citydata_ppltn')
    // POI001 의 장소명(강남 MICE 관광특구)이 URL에 인코딩되어 들어간다
    expect(decodeURIComponent(url)).toContain('강남 MICE 관광특구')
  })

  it('알 수 없는 areaCode면 예외를 던진다', async () => {
    mockFetchOnce('<Map></Map>')
    await expect(
      new SeoulCongestionProvider().fetchRaw('NOPE999'),
    ).rejects.toThrow()
  })

  it('HTTP 에러면 예외를 던진다', async () => {
    mockFetchOnce('error', false, 500)
    await expect(
      new SeoulCongestionProvider().fetchRaw('POI001'),
    ).rejects.toThrow()
  })
})
