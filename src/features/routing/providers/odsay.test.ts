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
    // 지하철 1회 탑승(직행)은 환승 0회. ODsay 의 TransitCount 는 탑승 횟수다.
    expect(leg.transfers).toBe(0)
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
    // 버스 1회 탑승(직행)은 환승 0회
    expect(legs[0].transfers).toBe(0)
  })

  describe('환승 횟수 = 탑승 횟수 - 1', () => {
    const transfersFor = async (bus: number, subway: number) => {
      mockFetchOnce({
        result: {
          path: [
            {
              pathType: 3,
              info: {
                totalTime: 40,
                payment: 1500,
                totalWalk: 100,
                busTransitCount: bus,
                subwayTransitCount: subway,
              },
            },
          ],
        },
      })
      const legs = await new OdsayTransitProvider().route({ from, to })
      return legs[0].transfers
    }

    it('지하철만 2번 타면 환승 1회', async () => {
      expect(await transfersFor(0, 2)).toBe(1)
    })

    it('버스 1번 + 지하철 1번이면 환승 1회', async () => {
      expect(await transfersFor(1, 1)).toBe(1)
    })

    it('지하철 2번 + 버스 1번이면 환승 2회', async () => {
      expect(await transfersFor(1, 2)).toBe(2)
    })

    it('탑승이 0회(도보뿐)여도 음수가 되지 않는다', async () => {
      expect(await transfersFor(0, 0)).toBe(0)
    })
  })

  it('ODsay error 객체가 오면 예외를 던진다', async () => {
    mockFetchOnce({ error: { code: '500', message: '검색 결과가 없습니다.' } })
    await expect(
      new OdsayTransitProvider().route({ from, to }),
    ).rejects.toThrow()
  })

  it('근거리(code -98)면 에러 대신 도보 Leg로 폴백한다', async () => {
    // 700m 이내라 ODsay가 경로를 주지 않는 경우: 걸어가는 것으로 대체한다.
    const near = { lat: 37.5665, lng: 126.978 }
    const nearTo = { lat: 37.5675, lng: 126.979 }
    mockFetchOnce({
      error: { code: '-98', msg: '출, 도착지가 700m이내입니다.' },
    })
    const legs = await new OdsayTransitProvider().route({
      from: near,
      to: nearTo,
      departAt: '2026-09-21T09:00:00.000Z',
    })
    expect(legs).toHaveLength(1)
    expect(legs[0].mode).toBe('walk')
    expect(legs[0].cost).toBe(0)
    expect(legs[0].transfers).toBe(0)
    expect(legs[0].walkDistanceM).toBeGreaterThan(0)
    expect(legs[0].durationSec).toBeGreaterThan(0)
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
