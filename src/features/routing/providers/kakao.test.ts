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

describe('KakaoCarProvider 정체 시간 (congestedDriveSec)', () => {
  const road = (duration: number, traffic_state: number) => ({
    duration,
    traffic_state,
    vertexes: [127.0, 37.5, 127.001, 37.501],
  })

  it('정체·지체는 전부, 서행은 절반, 원활·정보 없음은 제외해 합산한다', async () => {
    mockFetchOnce({
      routes: [
        {
          result_code: 0,
          summary: { duration: 1800, distance: 12000 },
          sections: [
            {
              roads: [
                road(300, 1), // 정체 300초 → 300
                road(200, 2), // 지체 200초 → 200
                road(400, 3), // 서행 400초 → 200
                road(500, 4), // 원활 → 제외
                road(100, 0), // 정보 없음 → 제외
              ],
            },
            { roads: [road(60, 1)] }, // 다른 section 의 정체 60초 → 60
          ],
        },
      ],
    })
    const [leg] = await new KakaoCarProvider().route({
      from: seoulStation,
      to: gangnam,
    })
    expect(leg.congestedDriveSec).toBe(760)
  })

  it('정체 도로가 없으면 0이다', async () => {
    mockFetchOnce({
      routes: [
        {
          result_code: 0,
          summary: { duration: 600, distance: 3000 },
          sections: [{ roads: [road(600, 4)] }],
        },
      ],
    })
    const [leg] = await new KakaoCarProvider().route({
      from: seoulStation,
      to: gangnam,
    })
    expect(leg.congestedDriveSec).toBe(0)
  })

  it('도로 정보(sections)가 없으면 정체 시간 필드를 넣지 않는다', async () => {
    mockFetchOnce({
      routes: [{ result_code: 0, summary: { duration: 600, distance: 3000 } }],
    })
    const [leg] = await new KakaoCarProvider().route({
      from: seoulStation,
      to: gangnam,
    })
    expect(leg.congestedDriveSec).toBeUndefined()
  })

  it('duration 이 숫자가 아닌 도로는 무시한다', async () => {
    mockFetchOnce({
      routes: [
        {
          result_code: 0,
          summary: { duration: 600, distance: 3000 },
          sections: [
            {
              roads: [
                { traffic_state: 1, vertexes: [] }, // duration 없음
                road(120, 1),
              ],
            },
          ],
        },
      ],
    })
    const [leg] = await new KakaoCarProvider().route({
      from: seoulStation,
      to: gangnam,
    })
    expect(leg.congestedDriveSec).toBe(120)
  })
})
