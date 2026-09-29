import type { Leg, LatLng, Mode, TransitStep } from '@shared/types'
import { WALK_SPEED_KMH, WALK_DETOUR_FACTOR } from '@shared/config'
import type { RouteProvider, RouteQuery } from './types'

/**
 * ODsay 대중교통 길찾기 provider (searchPubTransPathT). AGENTS.md 13장.
 * dev 프록시(/api/odsay)가 apiKey를 URL에 삽입해 api.odsay.com 으로 전달한다.
 * 요약형: result.path[0] → Leg 1개. 요금/도보거리/환승은 ODsay 응답 값을 그대로 쓴다
 * (카카오와 달리 실제 요금 payment 를 제공하므로 기본요금 상수를 쓰지 않는다).
 * 나중에 구간형이 필요하면 subPath[]를 Leg 여러 개로 쪼개도록 이 파일만 확장한다.
 *
 * 근거리 예외: ODsay는 출·도착지가 700m 이내면 code -98 로 경로를 주지 않는다.
 * 이는 "대중교통 대신 걸어가라"는 뜻이므로 에러로 처리하지 않고 도보 Leg로 폴백한다.
 */

const ODSAY_PATH = '/api/odsay/searchPubTransPathT'

/** 두 좌표의 대략적인 직선거리(m). 근거리 도보 폴백 추정용. */
function roughDistanceM(a: LatLng, b: LatLng): number {
  const dLat = (a.lat - b.lat) * 111_000
  const dLng = (a.lng - b.lng) * 88_000
  return Math.round(Math.sqrt(dLat * dLat + dLng * dLng))
}

function addSecondsBase(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString()
}

/**
 * 근거리(ODsay -98)일 때 대중교통 대신 걸어가는 것으로 보고 도보 Leg를 만든다.
 * 추정 방식은 도보 mock과 동일: 직선거리 × 우회계수, 도시 보행 속도.
 */
function walkFallbackLeg(query: RouteQuery): Leg {
  const departAt = query.departAt ?? new Date().toISOString()
  const straightM = roughDistanceM(query.from, query.to)
  const walkM = Math.round(straightM * WALK_DETOUR_FACTOR)
  const speedMps = (WALK_SPEED_KMH * 1000) / 3600
  const durationSec = Math.round(walkM / speedMps || 0)
  return {
    mode: 'walk',
    from: query.from,
    to: query.to,
    departAt,
    arriveAt: addSecondsBase(departAt, durationSec),
    durationSec,
    cost: 0,
    walkDistanceM: walkM,
    transfers: 0,
    fatigue: 0,
  }
}

/** ODsay 근거리 예외(code -98) 판별 */
function isNearDistanceError(error: Record<string, unknown>): boolean {
  const code = String(error.code ?? error.msgHead ?? '')
  return code === '-98'
}

type OdsayInfo = {
  totalTime?: number // 분
  payment?: number // 원
  totalWalk?: number // m
  busTransitCount?: number
  subwayTransitCount?: number
}

type OdsayLane = {
  name?: string // 지하철 노선명
  busNo?: string // 버스 번호
}

type OdsaySubPath = {
  trafficType?: number // 1:지하철, 2:버스, 3:도보
  distance?: number // m
  sectionTime?: number // 분
  stationCount?: number
  lane?: OdsayLane[]
  startName?: string
  endName?: string
}

type OdsayPath = {
  pathType?: number // 1:지하철, 2:버스, 3:버스+지하철
  info?: OdsayInfo
  subPath?: OdsaySubPath[]
}

type OdsayResponse = {
  result?: { path?: OdsayPath[] }
  // ODsay 에러 형식이 케이스마다 다를 수 있어 느슨하게 둔다.
  error?: Record<string, unknown>
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString()
}

/** pathType 2(버스) → bus, 그 외(지하철/혼합) → subway */
function pickMode(pathType: number | undefined): Mode {
  return pathType === 2 ? 'bus' : 'subway'
}

/** ODsay subPath[] → 표시용 구간 상세(TransitStep[]) */
function toTransitDetail(subPath: OdsaySubPath[] | undefined): TransitStep[] {
  if (!subPath) return []
  return subPath.map((s) => {
    const type: TransitStep['type'] =
      s.trafficType === 1 ? 'subway' : s.trafficType === 2 ? 'bus' : 'walk'
    const lane = s.lane?.[0]
    const line =
      type === 'subway' ? lane?.name : type === 'bus' ? lane?.busNo : undefined
    return {
      type,
      line,
      from: type === 'walk' ? undefined : s.startName,
      to: type === 'walk' ? undefined : s.endName,
      minutes: s.sectionTime ?? 0,
      distanceM: s.distance ?? 0,
      stationCount: s.stationCount,
    }
  })
}

export class OdsayTransitProvider implements RouteProvider {
  readonly mode = 'transit' as const

  async route(query: RouteQuery): Promise<Leg[]> {
    const { from, to } = query
    const departAt = query.departAt ?? new Date().toISOString()

    // ODsay 좌표: SX=경도(lng), SY=위도(lat)
    const params = new URLSearchParams({
      SX: String(from.lng),
      SY: String(from.lat),
      EX: String(to.lng),
      EY: String(to.lat),
    })

    const res = await fetch(`${ODSAY_PATH}?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      throw new Error(`ODsay 대중교통 HTTP 오류: ${res.status}`)
    }

    const data = (await res.json()) as OdsayResponse
    if (data.error) {
      const e = data.error as Record<string, unknown>
      // 근거리(700m 이내, code -98)는 에러가 아니라 "걸어가라"는 신호다.
      // 대중교통 대신 도보 Leg로 폴백해 전체 경로 계산이 죽지 않게 한다.
      if (isNearDistanceError(e)) {
        return [walkFallbackLeg(query)]
      }
      // 그 외 에러는 형식이 문서와 다를 수 있어 원본을 그대로 노출한다.
      const code = e.code ?? e.msgHead ?? '알 수 없음'
      const message = e.message ?? e.msgBody ?? JSON.stringify(data.error)
      throw new Error(`ODsay 오류(${code}): ${message}`)
    }
    const path = data.result?.path?.[0]
    if (!path) {
      // 경로가 없으면 응답 원본 일부를 함께 보여준다 (디버깅용)
      throw new Error(
        `ODsay 응답에 경로가 없습니다: ${JSON.stringify(data).slice(0, 300)}`,
      )
    }

    const info = path.info ?? {}
    const durationSec = (info.totalTime ?? 0) * 60
    const transfers =
      (info.busTransitCount ?? 0) + (info.subwayTransitCount ?? 0)

    const leg: Leg = {
      mode: pickMode(path.pathType),
      from,
      to,
      departAt,
      arriveAt: addSeconds(departAt, durationSec),
      durationSec,
      cost: info.payment ?? 0,
      walkDistanceM: info.totalWalk ?? 0,
      transfers,
      fatigue: 0, // 피로도는 scoring 단위에서 계산
      transitDetail: toTransitDetail(path.subPath),
    }
    return [leg]
  }
}
