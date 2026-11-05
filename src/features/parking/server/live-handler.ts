import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ParkingProvider } from '../providers/types'
import { searchBounds } from '../providers/geo'
import type { SeoulLiveRow } from '../providers/seoul-live'
import type { LiveParkingLot } from '../occupancy'

/**
 * 실시간 주차 HTTP 연결. AGENTS.md 8-2.
 * 서버가 서울시 실시간 주차(키 사용)를 받아 시설 DB 의 좌표와 id 로 조인하고,
 * 요청 반경 안의 주차장만 브라우저에 돌려준다. 인증키는 브라우저로 나가지 않는다.
 */

/** 실시간 값을 ttlMs 동안 캐시하고, 동시 요청은 외부 호출 한 번으로 합친다. 실패는 캐시하지 않는다. */
export function createCachedLiveSource(
  load: () => Promise<SeoulLiveRow[]>,
  ttlMs = 60_000,
  now: () => number = () => Date.now(),
): () => Promise<SeoulLiveRow[]> {
  let cached: { at: number; rows: SeoulLiveRow[] } | null = null
  let inflight: Promise<SeoulLiveRow[]> | null = null
  return () => {
    if (cached && now() - cached.at < ttlMs) return Promise.resolve(cached.rows)
    if (inflight) return inflight
    inflight = load()
      .then((rows) => {
        cached = { at: now(), rows }
        return rows
      })
      .finally(() => {
        inflight = null
      })
    return inflight
  }
}

export function createParkingLiveHandler(
  provider: ParkingProvider,
  source: () => Promise<SeoulLiveRow[]>,
) {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/api/parking/live') {
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
      const [facilities, live] = await Promise.all([
        provider.search(query),
        source(),
      ])
      const byId = new Map(live.map((row) => [row.id, row]))
      const lots: LiveParkingLot[] = []
      for (const facility of facilities) {
        const row = byId.get(facility.id)
        if (!row) continue
        lots.push({
          id: facility.id,
          location: facility.location,
          capacity: row.capacity,
          current: row.current,
          updatedAt: row.updatedAt,
        })
      }
      send(200, { lots })
    } catch {
      send(503, {
        error:
          '실시간 주차 데이터를 불러오지 못했습니다. API 키와 연결 상태를 확인해주세요.',
      })
    }
  }
}
