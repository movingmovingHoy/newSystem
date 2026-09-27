import { describe, it, expect, vi, afterEach } from 'vitest'
import { OdsayTransitProvider } from './odsay'

/**
 * ODsay 대중교통 길찾기 provider (searchPubTransPathT).
 * 요약형: result.path[0] → Leg 1개. 요금/도보거리/환승은 응답 값을 그대로 사용.
 * 테스트에서는 fetch를 mock으로 갈아끼운다.
 */

const from = { lat: 37.5547, lng: 126.9707 }
const to = { lat: 37.4979, lng: 127.0276 }

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

describe('OdsayTransitProvider', () => {
  it('첫 경로를 요약형 Leg으로 변환한다 (시간 분→초, 요금/도보/환승)', async () => {
    const fetchMock = mockFetchOnce({
      result: {
        path: [
          {
            pathType: 1, // 지하철
            info: {
              totalTime: 45, // 분
              payment: 1500,
              totalWalk: 320,
              busTransitCount: 0,
              subwayTransitCount: 1,
            },
            subPath: [
              { trafficType: 3, distance: 200, sectionTime: 3 },
              {
                trafficType: 1,
                distance: 8000,
                sectionTime: 20,
                stationCount: 6,
                lane: [{ name: '수도권 2호선' }],
                startName: '강남',
                endName: '역삼',
              },
              { trafficType: 3, distance: 120, sectionTime: 2 },
            ],
          },
        ],
      },
    })

    const legs = await new OdsayTransitProvider().route({
      from,
      to,
      departAt: '2026-09-21T09:00:00.000Z',
    })

    expect(legs).toHaveLength(1)
    const leg = legs[0]
    expect(leg.mode).toBe('subway')
    expect(leg.durationSec).toBe(45 * 60)
    expect(leg.cost).toBe(1500) // ODsay 실제 요금
    expect(leg.walkDistanceM).toBe(320)
    expect(leg.transfers).toBe(1) // bus0 + subway1
    expect(leg.arriveAt).toBe('2026-09-21T09:45:00.000Z')

    // 구간 상세: 도보 → 지하철(2호선 강남→역삼) → 도보
    expect(leg.transitDetail).toHaveLength(3)
    expect(leg.transitDetail![0].type).toBe('walk')
    expect(leg.transitDetail![1]).toMatchObject({
      type: 'subway',
      line: '수도권 2호선',
      from: '강남',
      to: '역삼',
      minutes: 20,
      stationCount: 6,
    })
    expect(leg.transitDetail![2].type).toBe('walk')

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/api/odsay/searchPubTransPathT')
    // 좌표는 SX=경도, SY=위도
    expect(url).toContain('SX=126.9707')
    expect(url).toContain('SY=37.5547')
  })

  it('버스 위주(pathType=2)면 mode가 bus다', async () => {
    mockFetchOnce({
      result: {
        path: [
          {
            pathType: 2,
            info: {
              totalTime: 30,
              payment: 1200,
              totalWalk: 200,
              busTransitCount: 1,
              subwayTransitCount: 0,
            },
          },
        ],
      },
    })
    const legs = await new OdsayTransitProvider().route({ from, to })
    expect(legs[0].mode).toBe('bus')
    expect(legs[0].transfers).toBe(1)
  })

  it('ODsay error 객체가 오면 예외를 던진다', async () => {
    mockFetchOnce({ error: { code: '500', message: '검색 결과가 없습니다.' } })
    await expect(
      new OdsayTransitProvider().route({ from, to }),
    ).rejects.toThrow()
  })

  it('path가 비어 있으면 예외를 던진다', async () => {
    mockFetchOnce({ result: { path: [] } })
    await expect(
      new OdsayTransitProvider().route({ from, to }),
    ).rejects.toThrow()
  })

  it('HTTP 에러면 예외를 던진다', async () => {
    mockFetchOnce({}, false, 500)
    await expect(
      new OdsayTransitProvider().route({ from, to }),
    ).rejects.toThrow()
  })
})
