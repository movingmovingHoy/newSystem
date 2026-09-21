import { describe, it, expect, vi, afterEach } from 'vitest'
import { KakaoWalkProvider } from './kakao-walk'

/**
 * 카카오모빌리티 도보 길찾기 provider.
 * 응답: routes[0].summary { distance(m), duration(sec) }
 * 테스트에서는 전역 fetch를 mock으로 갈아끼운다 (AGENTS.md 15장).
 */

const from = { lat: 37.5641, lng: 126.9924 }
const to = { lat: 37.5612, lng: 126.9911 }

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('KakaoWalkProvider', () => {
  it('성공 응답을 walk Leg으로 변환한다 (거리=도보거리)', async () => {
    const fetchMock = mockFetchOnce({
      routes: [{ result_code: 0, summary: { distance: 1281, duration: 1220 } }],
    })

    const legs = await new KakaoWalkProvider().route({
      from,
      to,
      departAt: '2026-09-21T09:00:00.000Z',
    })

    expect(legs).toHaveLength(1)
    const leg = legs[0]
    expect(leg.mode).toBe('walk')
    expect(leg.durationSec).toBe(1220)
    expect(leg.walkDistanceM).toBe(1281)
    expect(leg.cost).toBe(0) // 도보는 비용 없음
    expect(leg.transfers).toBe(0)
    expect(leg.arriveAt).toBe('2026-09-21T09:20:20.000Z') // +1220s

    // 도보도 apis-navi 호스트 → 기존 navi 프록시 경로 사용
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/kakao/navi/affiliate/walking/v1/directions')
  })

  it('result_code가 0이 아니면 예외를 던진다', async () => {
    mockFetchOnce({ routes: [{ result_code: 104 }] })
    await expect(new KakaoWalkProvider().route({ from, to })).rejects.toThrow()
  })

  it('HTTP 에러면 예외를 던진다', async () => {
    mockFetchOnce({}, false, 401)
    await expect(new KakaoWalkProvider().route({ from, to })).rejects.toThrow()
  })

  it('routes가 비어 있으면 예외를 던진다', async () => {
    mockFetchOnce({ routes: [] })
    await expect(new KakaoWalkProvider().route({ from, to })).rejects.toThrow()
  })
})
