import type { Leg, Mode } from '@shared/types'
import { TRANSIT_BASE_FARE } from '@shared/config'
import type { RouteProvider, RouteQuery } from './types'

/**
 * 카카오 대중교통(멀티모달) provider. AGENTS.md 13장.
 * 요약형: 여러 journeys 중 첫 번째(추천 순)를 Leg 1개로 압축한다.
 * 나중에 구간형이 필요하면 sections[]를 각각 Leg로 쪼개도록 이 파일만 확장한다.
 *
 * 요금: 통합 기본요금(TRANSIT_BASE_FARE) 1회. 환승·거리 추가요금 없음.
 */

const TRANSIT_PATH = '/api/kakao/navi/affiliate/publictransit/v1/multimodal'

type TransitSection = {
  route?: { route_short_name?: string }
  distance?: number
}

type Journey = {
  summary?: {
    total_time?: number
    distance?: number
    walking_time?: number
    transfer_count?: number
    transport_type?: string[]
  }
  sections?: TransitSection[]
}

type KakaoTransitResponse = {
  result_code?: number
  result_message?: string
  journeys?: Journey[]
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString()
}

/** transport_type 배열의 대표값으로 mode 결정 (Bus 위주면 bus, 아니면 subway) */
function pickMode(transportType: string[] | undefined): Mode {
  const types = (transportType ?? []).map((t) => t.toLowerCase())
  if (types.length > 0 && types.every((t) => t === 'bus')) return 'bus'
  return 'subway'
}

/** Walk 구간들의 거리 합 (m) */
function walkDistance(sections: TransitSection[] | undefined): number {
  if (!sections) return 0
  return sections
    .filter((s) => s.route?.route_short_name === 'Walk')
    .reduce((sum, s) => sum + (s.distance ?? 0), 0)
}

export class KakaoTransitProvider implements RouteProvider {
  readonly mode = 'transit' as const

  async route(query: RouteQuery): Promise<Leg[]> {
    const { from, to } = query
    const departAt = query.departAt ?? new Date().toISOString()

    const params = new URLSearchParams({
      origin: `${from.lng},${from.lat}`,
      destination: `${to.lng},${to.lat}`,
    })

    const res = await fetch(`${TRANSIT_PATH}?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      throw new Error(`카카오 대중교통 HTTP 오류: ${res.status}`)
    }

    const data = (await res.json()) as KakaoTransitResponse
    if (data.result_code !== 0) {
      throw new Error(
        `카카오 대중교통 실패(code=${data.result_code}): ${data.result_message ?? '알 수 없음'}`,
      )
    }
    const journey = data.journeys?.[0]
    if (!journey) {
      throw new Error('카카오 대중교통 응답에 경로가 없습니다')
    }

    const s = journey.summary ?? {}
    const durationSec = s.total_time ?? 0

    const leg: Leg = {
      mode: pickMode(s.transport_type),
      from,
      to,
      departAt,
      arriveAt: addSeconds(departAt, durationSec),
      durationSec,
      cost: TRANSIT_BASE_FARE, // 기본요금 1회 (환승/거리 추가 없음)
      walkDistanceM: walkDistance(journey.sections),
      transfers: s.transfer_count ?? 0,
      fatigue: 0, // 피로도는 scoring 단위에서 계산
    }
    return [leg]
  }
}
