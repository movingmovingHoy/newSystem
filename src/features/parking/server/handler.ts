import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ParkingProvider } from '../providers/types'
import { searchBounds } from '../providers/geo'
export function createParkingHandler(provider: ParkingProvider) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/api/parking') {
      next()
      return
    }
    const send = (status: number, data: unknown) => {
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(data))
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      send(405, { error: 'GET 요청만 지원합니다.' })
      return
    }
    const values = ['lat', 'lng', 'radiusM'].map((key) =>
      url.searchParams.get(key),
    )
    const [lat, lng, radiusM] = values.map(Number)
    const query = { center: { lat, lng }, radiusM }
    try {
      if (
        values.some((value) => value === null || value.trim() === '') ||
        radiusM > 1000
      )
        throw new Error()
      searchBounds(query)
    } catch {
      send(400, { error: '좌표와 0~1000m 검색 반경이 필요합니다.' })
      return
    }
    try {
      send(200, { lots: await provider.search(query) })
    } catch {
      send(503, {
        error:
          '실제 주차장 데이터를 불러오지 못했습니다. API 키와 연결 상태를 확인해주세요.',
      })
    }
  }
}
