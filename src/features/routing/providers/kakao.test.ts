import { describe, it, expect, vi, afterEach } from 'vitest'
import { KakaoCarProvider } from './kakao'

/**
 * 실제 카카오모빌리티 자차 길찾기 provider.
 * 테스트에서는 전역 fetch를 mock으로 갈아끼운다 (AGENTS.md 15장: 외부 API는 mock).
 */

const seoulStation = { lat: 37.5547, lng: 126.9707 }
const gangnam = { lat: 37.4979, lng: 127.0276 }

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('KakaoCarProvider', () => {
  it('성공 응답을 하나의 car Leg으로 변환한다', async () => {
    const fetchMock = mockFetchOnce({
      routes: [
        {
          result_code: 0,
          summary: {
            duration: 1800, // 30분(초)
            distance: 12000, // 12km
            fare: { taxi: 15000, toll: 900 },
          },
        },
      ],
    })

    const legs = await new KakaoCarProvider().route({
      from: seoulStation,
      to: gangnam,
      departAt: '2026-09-21T09:00:00.000Z',
    })

    expect(legs).toHaveLength(1)
    const leg = legs[0]
    expect(leg.mode).toBe('car')
    expect(leg.durationSec).toBe(1800)
    // 통행료가 cost로 (AGENTS.md Leg: 교통비/통행료, 주차비 제외)
    expect(leg.cost).toBe(900)
    expect(leg.walkDistanceM).toBe(0)
    expect(leg.transfers).toBe(0)
    expect(leg.departAt).toBe('2026-09-21T09:00:00.000Z')
    // 도착 = 출발 + 30분
    expect(leg.arriveAt).toBe('2026-09-21T09:30:00.000Z')

    // 프론트는 카카오를 직접 부르지 않고 dev 프록시 경로를 쓴다
    const calledUrl = fetchMock.mock.calls[0][0] as string
    expect(calledUrl).toContain('/api/kakao/navi')
  })

  it('통행료(toll) 필드가 없으면 cost는 0이다', async () => {
    mockFetchOnce({
      routes: [
        {
          result_code: 0,
          summary: { duration: 600, distance: 3000 },
        },
      ],
    })
    const legs = await new KakaoCarProvider().route({
      from: seoulStation,
      to: gangnam,
    })
    expect(legs[0].cost).toBe(0)
  })

  it('result_code가 0이 아니면 (길찾기 실패) 예외를 던진다', async () => {
    mockFetchOnce({
      routes: [{ result_code: 104, result_msg: '경로를 찾을 수 없음' }],
    })
    await expect(
      new KakaoCarProvider().route({ from: seoulStation, to: gangnam }),
    ).rejects.toThrow()
  })

  it('HTTP 에러(ok=false)면 예외를 던진다', async () => {
    mockFetchOnce({ msg: 'unauthorized' }, false, 401)
    await expect(
      new KakaoCarProvider().route({ from: seoulStation, to: gangnam }),
    ).rejects.toThrow()
  })

  it('routes가 비어 있으면 예외를 던진다', async () => {
    mockFetchOnce({ routes: [] })
    await expect(
      new KakaoCarProvider().route({ from: seoulStation, to: gangnam }),
    ).rejects.toThrow()
  })
})
