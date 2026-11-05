// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  createCachedLiveSource,
  createParkingLiveHandler,
} from './live-handler'
import type { SeoulLiveRow } from '../providers/seoul-live'

const liveRow = (
  id: string,
  over: Partial<SeoulLiveRow> = {},
): SeoulLiveRow => ({
  id,
  capacity: 100,
  current: 40,
  updatedAt: '2026-11-05T09:59:23.000Z',
  ...over,
})

const facility = (id: string, lat: number, lng: number) => ({
  id,
  name: id,
  location: { lat, lng },
  fee: null,
  distanceToWaypointM: 0,
})

async function call(
  url: string,
  options: {
    method?: string
    search?: ReturnType<typeof vi.fn>
    source?: () => Promise<SeoulLiveRow[]>
  } = {},
) {
  const search = options.search ?? vi.fn().mockResolvedValue([])
  const source = options.source ?? (async () => [])
  let body = ''
  const res = {
    statusCode: 0,
    setHeader: vi.fn(),
    end: (s: string) => {
      body = s
    },
  }
  const next = vi.fn()
  await createParkingLiveHandler(
    { search, getAvailability: async () => ({ status: 'unknown' }) },
    source,
  )(
    { url, method: options.method ?? 'GET' } as IncomingMessage,
    res as unknown as ServerResponse,
    next,
  )
  return { status: res.statusCode, body, search, next }
}

const ok = '/api/parking/live?lat=37.57&lng=126.98&radiusM=1000'

describe('실시간 주차 HTTP 연결', () => {
  it('시설 DB 와 id 가 같은 주차장만 좌표를 붙여 돌려준다', async () => {
    const search = vi.fn().mockResolvedValue([
      facility('seoul:1', 37.571, 126.981),
      facility('ts:9', 37.572, 126.982), // 실시간 목록에 없음
      facility('seoul:2', 37.573, 126.983),
    ])
    const source = async () => [
      liveRow('seoul:1', { capacity: 200, current: 150 }),
      liveRow('seoul:2'),
      liveRow('seoul:7'), // 시설 DB 반경 밖 (검색 결과에 없음)
    ]
    const r = await call(ok, { search, source })
    expect(r.status).toBe(200)
    const lots = JSON.parse(r.body).lots
    expect(lots.map((l: { id: string }) => l.id)).toEqual([
      'seoul:1',
      'seoul:2',
    ])
    expect(lots[0]).toEqual({
      id: 'seoul:1',
      location: { lat: 37.571, lng: 126.981 },
      capacity: 200,
      current: 150,
      updatedAt: '2026-11-05T09:59:23.000Z',
    })
  })

  it('검색 좌표와 반경을 시설 검색에 전달한다', async () => {
    const search = vi.fn().mockResolvedValue([])
    await call(ok, { search })
    expect(search).toHaveBeenCalledWith({
      center: { lat: 37.57, lng: 126.98 },
      radiusM: 1000,
    })
  })

  it('반경 안에 실시간 주차장이 없으면 빈 목록으로 200 (정보 없음)', async () => {
    const r = await call(ok, {
      search: vi.fn().mockResolvedValue([facility('ts:9', 37.5, 127)]),
      source: async () => [liveRow('seoul:1')],
    })
    expect(r.status).toBe(200)
    expect(JSON.parse(r.body).lots).toEqual([])
  })

  it.each([
    '/api/parking/live',
    '/api/parking/live?lat=NaN&lng=127&radiusM=1',
    '/api/parking/live?lat=37&lng=127&radiusM=1001',
  ])('잘못된 요청을 외부 호출 전에 거절한다 %s', async (url) => {
    const source = vi.fn().mockResolvedValue([])
    const r = await call(url, { source })
    expect(r.status).toBe(400)
    expect(r.search).not.toHaveBeenCalled()
    expect(source).not.toHaveBeenCalled()
  })

  it('다른 경로(기존 /api/parking 포함)는 통과시키고 쓰기 요청은 거절한다', async () => {
    expect((await call('/api/other')).next).toHaveBeenCalled()
    expect(
      (await call('/api/parking?lat=1&lng=1&radiusM=1')).next,
    ).toHaveBeenCalled()
    expect((await call('/api/parking/live', { method: 'POST' })).status).toBe(
      405,
    )
  })

  it('외부 API 실패는 503 이며 비밀 원문을 노출하지 않는다', async () => {
    const r = await call(ok, {
      source: async () => {
        throw new Error('secret-key')
      },
    })
    expect(r.status).toBe(503)
    expect(r.body).not.toContain('secret-key')
  })

  it('시설 검색 실패도 503 이다', async () => {
    const r = await call(ok, {
      search: vi.fn().mockRejectedValue(new Error('db')),
    })
    expect(r.status).toBe(503)
  })
})

describe('createCachedLiveSource', () => {
  it('유효 시간 안에는 한 번만 불러온다', async () => {
    let clock = 0
    const load = vi.fn().mockResolvedValue([liveRow('seoul:1')])
    const source = createCachedLiveSource(load, 60_000, () => clock)
    await source()
    clock = 59_000
    await source()
    expect(load).toHaveBeenCalledTimes(1)
    clock = 61_000
    await source()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('동시에 여러 번 부르면 외부 호출을 합친다', async () => {
    const load = vi.fn().mockResolvedValue([liveRow('seoul:1')])
    const source = createCachedLiveSource(load, 60_000, () => 0)
    await Promise.all([source(), source(), source()])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('실패는 캐시하지 않고 다음 요청에서 다시 시도한다', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce([liveRow('seoul:1')])
    const source = createCachedLiveSource(load, 60_000, () => 0)
    await expect(source()).rejects.toThrow('boom')
    await expect(source()).resolves.toHaveLength(1)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
