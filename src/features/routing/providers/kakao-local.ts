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
  meta?: {
    /** 마지막 페이지면 true. 더 받을 페이지가 없다. */
    is_end?: boolean
  }
}

/** 카카오 키워드 검색 한 페이지. 최대 3페이지(45개)까지 받는다. */
const PAGE_SIZE = 15
const MAX_PAGES = 3

/**
 * 검색어와 장소명의 관련도 점수. 낮을수록 위에 온다.
 * 카카오가 주는 순서는 거리/정확도가 섞여 있어, 이름이 검색어와
 * 더 잘 맞는 쪽(완전일치 > 접두 일치 > 앞쪽 포함)을 우선한다.
 * 이름에 검색어가 없으면(주소로만 매칭된 경우) 카카오 원래 순서를 유지한다.
 */
export function relevanceRank(name: string, query: string): number {
  const n = name.trim().toLowerCase()
  const q = query.trim().toLowerCase()
  if (!q) return 3
  if (n === q) return 0 // 완전 일치
  if (n.startsWith(q)) return 1 // 접두 일치 (성수카페거리 ← "성수")
  if (n.includes(q)) return 2 // 중간 포함
  return 3 // 이름 미포함 (주소 매칭 등) → 원래 순서 유지
}

/** 한 페이지 조회. documents 와 다음 페이지 존재 여부를 돌려준다. */
async function fetchPage(
  q: string,
  page: number,
): Promise<{ results: PlaceResult[]; isEnd: boolean }> {
  const params = new URLSearchParams({
    query: q,
    size: String(PAGE_SIZE),
    page: String(page),
  })
  const res = await fetch(`${KEYWORD_SEARCH_PATH}?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`카카오 로컬 검색 HTTP 오류: ${res.status}`)
  }
  const data = (await res.json()) as KakaoLocalResponse
  const results = (data.documents ?? []).map((d) => ({
    name: d.place_name ?? '',
    address: d.road_address_name || d.address_name || '',
    location: { lat: Number(d.y), lng: Number(d.x) },
  }))
  // meta 가 없으면(테스트 mock 등) 더 받지 않는다(1페이지로 간주).
  const isEnd = data.meta?.is_end ?? true
  return { results, isEnd }
}

export async function searchPlaces(query: string): Promise<PlaceResult[]> {
  const q = query.trim()
  if (!q) return []

  // 여러 페이지를 순차로 받아 후보 풀을 넓힌다. 카카오가 "성수동카페거리"를
  // 뒤 페이지에 두더라도 포착해, 관련도 정렬로 위로 올릴 수 있게 한다.
  const collected: PlaceResult[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { results, isEnd } = await fetchPage(q, page)
    collected.push(...results)
    if (isEnd || results.length === 0) break
  }

  // 좌표+이름으로 중복 제거 (페이지 경계에서 겹칠 수 있다).
  const seen = new Set<string>()
  const unique = collected.filter((r) => {
    const key = `${r.name}:${r.location.lat}:${r.location.lng}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // 관련도 순으로 안정 정렬. 동점이면 카카오 원래 순서(index)를 지킨다.
  return unique
    .map((r, i) => ({ r, i, rank: relevanceRank(r.name, q) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.r)
}
