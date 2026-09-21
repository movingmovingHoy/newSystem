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
