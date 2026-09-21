import { describe, it, expect, vi, afterEach } from 'vitest'
import { KakaoTransitProvider } from './kakao-transit'
import { TRANSIT_BASE_FARE } from '@shared/config'

/**
 * 카카오 대중교통(멀티모달) provider. 요약형: journeys[0] → Leg 1개.
 * 요금은 통합 기본요금 1회(TRANSIT_BASE_FARE), 환승/거리 추가요금 없음.
 * 테스트에서는 fetch를 mock으로 갈아끼운다.
 */

const from = { lat: 37.3947, lng: 127.1101 }
const to = { lat: 37.4967, lng: 127.0281 }

function sampleBody() {
  return {
    result_code: 0,
    result_message: '성공',
    journeys: [
      {
        summary: {
          score: 1144,
          distance: 14371,
          total_time: 1089,
          walking_time: 278,
          transfer_count: 0,
          transport_type: ['Subway'],
        },
        sections: [
          {
            route: { route_short_name: 'Walk' },
            distance: 96,
          },
          {
            route: { route_short_name: '신분당' },
            distance: 14172,
          },
          {
            route: { route_short_name: 'Walk' },
            distance: 103,
          },
        ],
      },
      {
        summary: {
          score: 2007,
          distance: 16836,
          total_time: 1826,
          walking_time: 905,
          transfer_count: 1,
          transport_type: ['Bus'],
        },
        sections: [],
      },
    ],
  }
}

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

describe('KakaoTransitProvider', () => {
  it('첫 번째 journey를 요약형 Leg 하나로 변환한다', async () => {
    const fetchMock = mockFetchOnce(sampleBody())

    const legs = await new KakaoTransitProvider().route({
      from,
      to,
      departAt: '2026-09-21T09:00:00.000Z',
    })

    expect(legs).toHaveLength(1)
    const leg = legs[0]
    // 지하철 위주 → subway
    expect(leg.mode).toBe('subway')
    expect(leg.durationSec).toBe(1089)
    expect(leg.transfers).toBe(0)
    // 도보 구간 거리 합 (96 + 103)
    expect(leg.walkDistanceM).toBe(199)
    // 요금은 기본요금 1회
    expect(leg.cost).toBe(TRANSIT_BASE_FARE)
    expect(leg.arriveAt).toBe('2026-09-21T09:18:09.000Z') // +1089s

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/kakao/navi')
  })

  it('버스 위주 경로는 mode가 bus다', async () => {
    const body = sampleBody()
    // journeys[0]을 버스로
    body.journeys[0].summary.transport_type = ['Bus']
    mockFetchOnce(body)
    const legs = await new KakaoTransitProvider().route({ from, to })
    expect(legs[0].mode).toBe('bus')
  })

  it('환승 횟수와 무관하게 요금은 기본요금 1회다', async () => {
    const body = sampleBody()
    body.journeys[0].summary.transfer_count = 3
    mockFetchOnce(body)
    const legs = await new KakaoTransitProvider().route({ from, to })
    expect(legs[0].cost).toBe(TRANSIT_BASE_FARE)
    expect(legs[0].transfers).toBe(3)
  })

  it('result_code가 0이 아니면 예외를 던진다', async () => {
    mockFetchOnce({ result_code: 9, journeys: [] })
    await expect(
      new KakaoTransitProvider().route({ from, to }),
    ).rejects.toThrow()
  })

  it('journeys가 비어 있으면 예외를 던진다', async () => {
    mockFetchOnce({ result_code: 0, journeys: [] })
    await expect(
      new KakaoTransitProvider().route({ from, to }),
    ).rejects.toThrow()
  })

  it('HTTP 에러면 예외를 던진다', async () => {
    mockFetchOnce({}, false, 500)
    await expect(
      new KakaoTransitProvider().route({ from, to }),
    ).rejects.toThrow()
  })
})
