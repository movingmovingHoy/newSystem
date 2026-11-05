// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createParkingHandler } from './handler'
async function call(
  url: string,
  method = 'GET',
  search = vi.fn().mockResolvedValue([]),
) {
  let body = ''
  const res = {
    statusCode: 0,
    setHeader: vi.fn(),
    end: (s: string) => {
      body = s
    },
  }
  const next = vi.fn()
  await createParkingHandler({
    search,
    getAvailability: async () => ({ status: 'unknown' }),
  })({ url, method } as IncomingMessage, res as unknown as ServerResponse, next)
  return { status: res.statusCode, body, search, next }
}
describe('로컬 주차장 HTTP 연결', () => {
  it('검색 좌표를 provider로 전달하고 실제 목록을 반환한다', async () => {
    const search = vi.fn().mockResolvedValue([{ id: 'seoul:1' }])
    const r = await call(
      '/api/parking?lat=37.57&lng=126.98&radiusM=1000',
      'GET',
      search,
    )
    expect(r.status).toBe(200)
    expect(JSON.parse(r.body).lots[0].id).toBe('seoul:1')
    expect(search).toHaveBeenCalledWith({
      center: { lat: 37.57, lng: 126.98 },
      radiusM: 1000,
    })
  })
  it.each([
    '/api/parking',
    '/api/parking?lat=NaN&lng=127&radiusM=1',
    '/api/parking?lat=37&lng=127&radiusM=1001',
  ])('잘못된 요청을 수집 전에 거절한다 %s', async (url) => {
    const r = await call(url)
    expect(r.status).toBe(400)
    expect(r.search).not.toHaveBeenCalled()
  })
  it('다른 경로는 통과시키고 쓰기 요청은 거절한다', async () => {
    expect((await call('/api/other')).next).toHaveBeenCalled()
    expect((await call('/api/parking', 'POST')).status).toBe(405)
  })
  it('API 실패는 빈 성공 목록 대신 503이며 비밀 원문을 노출하지 않는다', async () => {
    const r = await call(
      '/api/parking?lat=37&lng=127&radiusM=1000',
      'GET',
      vi.fn().mockRejectedValue(new Error('secret-key')),
    )
    expect(r.status).toBe(503)
    expect(r.body).not.toContain('secret-key')
  })
})
