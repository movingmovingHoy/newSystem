import type { LatLng } from '@shared/types'

/**
 * 카카오 로컬 장소검색 provider. AGENTS.md 13장 (장소 검색/좌표 변환).
 * dev 프록시(/api/kakao/dapi)로 호출한다. 외부 API는 provider 안에서만 (5, 17장).
 */

const KEYWORD_SEARCH_PATH = '/api/kakao/dapi/v2/local/search/keyword.json'

export type PlaceResult = {
  name: string
  address: string
  location: LatLng
}

type KakaoLocalResponse = {
  documents?: Array<{
    place_name?: string
    road_address_name?: string
    address_name?: string
    x?: string // lng
    y?: string // lat
  }>
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim()
  if (!q) return []

  const params = new URLSearchParams({ query: q, size: '10' })
  const res = await fetch(`${KEYWORD_SEARCH_PATH}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`카카오 로컬 검색 HTTP 오류: ${res.status}`)
  }

  const data = (await res.json()) as KakaoLocalResponse
  return (data.documents ?? []).map((d) => ({
    name: d.place_name ?? '',
    address: d.road_address_name || d.address_name || '',
    location: { lat: Number(d.y), lng: Number(d.x) },
  }))
}
