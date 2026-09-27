import type { LatLng } from '@shared/types'
import areasGeo from './areas.geo.json'

/**
 * 좌표 → 서울 121장소 areaCode 매칭. AGENTS.md 11장.
 * 폴리곤 경계(WGS84 위경도) 안이면 areaCode, 밖이면 null.
 * point-in-polygon 은 ray casting 으로 직접 구현(외부 의존 없음).
 * 좌표는 GeoJSON 표준 [경도(lng), 위도(lat)] 순서.
 */

type Position = [number, number] // [lng, lat]

type AreaFeature = {
  properties: { areaCode: string; areaName: string; category: string }
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] }
}

const features = (areasGeo as { features: AreaFeature[] }).features

/** ray casting: 점이 링(외곽 경계) 내부인지 */
export function pointInRing(
  point: [number, number],
  ring: [number, number][],
): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/**
 * 폴리곤(외곽 링 + 구멍들) 내부 판정.
 * coordinates[0] 은 외곽 링, 이후는 구멍(hole). 구멍 안이면 밖으로 친다.
 */
function pointInPolygon(point: Position, rings: number[][][]): boolean {
  if (rings.length === 0) return false
  const outer = rings[0] as [number, number][]
  if (!pointInRing(point, outer)) return false
  for (let h = 1; h < rings.length; h++) {
    if (pointInRing(point, rings[h] as [number, number][])) return false
  }
  return true
}

export function matchArea(loc: LatLng): string | null {
  const point: Position = [loc.lng, loc.lat]
  for (const f of features) {
    const g = f.geometry
    if (g.type === 'Polygon') {
      if (pointInPolygon(point, g.coordinates)) return f.properties.areaCode
    } else {
      // MultiPolygon: 폴리곤 배열 중 하나라도 포함하면 매칭
      for (const poly of g.coordinates) {
        if (pointInPolygon(point, poly)) return f.properties.areaCode
      }
    }
  }
  return null
}

const AREA_NAME_BY_CODE = new Map(
  features.map((f) => [f.properties.areaCode, f.properties.areaName]),
)

/** areaCode → 장소명(areaName). 서울 도시데이터는 장소명으로 요청한다. 없으면 null */
export function areaNameOf(areaCode: string): string | null {
  return AREA_NAME_BY_CODE.get(areaCode) ?? null
}

export type AreaInfo = {
  areaCode: string
  areaName: string
  category: string
  /** 대표 좌표 (외곽 링 bbox 중심) */
  center: LatLng
}

/** 폴리곤/멀티폴리곤 외곽 링을 얻는다 */
function outerRing(g: AreaFeature['geometry']): number[][] {
  return g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]
}

function bboxCenter(ring: number[][]): LatLng {
  let mnx = Infinity,
    mxx = -Infinity,
    mny = Infinity,
    mxy = -Infinity
  for (const [x, y] of ring) {
    if (x < mnx) mnx = x
    if (x > mxx) mxx = x
    if (y < mny) mny = y
    if (y > mxy) mxy = y
  }
  return { lat: (mny + mxy) / 2, lng: (mnx + mxx) / 2 }
}

const AREA_LIST: AreaInfo[] = features.map((f) => ({
  areaCode: f.properties.areaCode,
  areaName: f.properties.areaName,
  category: f.properties.category,
  center: bboxCenter(outerRing(f.geometry)),
}))

/** 121곳 목록 (areaCode, 이름, 분류, 대표좌표). 도착지/경유지 선택용 */
export function listAreas(): AreaInfo[] {
  return AREA_LIST
}

/** 이름/분류에 검색어가 포함된 121곳만 필터 */
export function searchAreas(query: string): AreaInfo[] {
  const q = query.trim().toLowerCase()
  if (!q) return AREA_LIST
  return AREA_LIST.filter(
    (a) =>
      a.areaName.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q),
  )
}
