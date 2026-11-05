import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpLiveParkingProvider } from './http-live'

afterEach(() => vi.unstubAllGlobals())

const center = { lat: 37.5, lng: 127.0 }
const now = new Date('2026-11-05T10:00:00Z')
const near = { lat: 37.503, lng: 127.0 } // 약 333m

const stubLots = (lots: unknown[]) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => ({ lots }) })

describe('실시간 주차 브라우저 provider', () => {
  it('키 없이 로컬 API 를 부르고 반경 내 합계 포화율을 돌려준다', async () => {
    const fetcher = stubLots([
      {
        id: 'seoul:1',
        location: near,
        capacity: 100,
        current: 90,
        updatedAt: '2026-11-05T09:55:00Z',
      },
      {
        id: 'seoul:2',
        location: near,
        capacity: 300,
        current: 30,
        updatedAt: '2026-11-05T09:55:00Z',
      },
    ])
    vi.stubGlobal('fetch', fetcher)
    const occupancy = await new HttpLiveParkingProvider().occupancy(
      center,
      1000,
      now,
    )
    expect(fetcher.mock.calls[0][0]).toBe(
      '/api/parking/live?lat=37.5&lng=127&radiusM=1000',
    )
    expect(occupancy?.ratio).toBeCloseTo(0.3)
    expect(occupancy?.lotCount).toBe(2)
  })

  it('갱신이 오래된 주차장만 있으면 null (정보 없음)', async () => {
    vi.stubGlobal(
      'fetch',
      stubLots([
        {
          id: 'seoul:1',
          location: near,
          capacity: 100,
          current: 50,
          updatedAt: '2026-11-05T08:00:00Z',
        },
      ]),
    )
    expect(
      await new HttpLiveParkingProvider().occupancy(center, 1000, now),
    ).toBeNull()
  })

  it('목록이 비어 있으면 null', async () => {
    vi.stubGlobal('fetch', stubLots([]))
    expect(
      await new HttpLiveParkingProvider().occupancy(center, 1000, now),
    ).toBeNull()
  })

  it('조회 실패는 빈 값으로 숨기지 않고 던진다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    )
    await expect(
      new HttpLiveParkingProvider().occupancy(center, 1000, now),
    ).rejects.toThrow('불러오지 못했습니다')
  })

  it('응답 형식이 틀리면 던진다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    )
    await expect(
      new HttpLiveParkingProvider().occupancy(center, 1000, now),
    ).rejects.toThrow('올바르지 않습니다')
  })
})
