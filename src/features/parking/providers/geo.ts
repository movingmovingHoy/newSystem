import type { LatLng, ParkingLot } from '@shared/types'
import type { ParkingSearch } from './types'
import type { StoredParkingLot } from '../ingest/snapshot'

const earthRadiusM = 6_371_008.8
const radians = (degrees: number) => (degrees * Math.PI) / 180
export type SearchBounds = {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

export function validateLocation(location: LatLng): void {
  if (
    !Number.isFinite(location.lat) ||
    Math.abs(location.lat) > 90 ||
    !Number.isFinite(location.lng) ||
    Math.abs(location.lng) > 180
  ) {
    throw new RangeError('올바른 위도와 경도가 필요합니다.')
  }
}

export function searchBounds({ center, radiusM }: ParkingSearch): SearchBounds {
  validateLocation(center)
  if (!Number.isFinite(radiusM) || radiusM < 0)
    throw new RangeError('검색 반경은 0 이상의 유한한 거리여야 합니다.')
  const angle = Math.min(Math.PI, radiusM / earthRadiusM)
  const deltaLat = (angle * 180) / Math.PI
  const minLat = Math.max(-90, center.lat - deltaLat)
  const maxLat = Math.min(90, center.lat + deltaLat)
  const deltaLng =
    minLat <= -90 || maxLat >= 90
      ? 180
      : (Math.asin(
          Math.min(1, Math.sin(angle) / Math.cos(radians(center.lat))),
        ) *
          180) /
        Math.PI
  const crossesDateline =
    center.lng - deltaLng < -180 || center.lng + deltaLng > 180
  return {
    minLat,
    maxLat,
    minLng: crossesDateline ? -180 : center.lng - deltaLng,
    maxLng: crossesDateline ? 180 : center.lng + deltaLng,
  }
}

export function distanceM(from: LatLng, to: LatLng): number {
  const haversine =
    Math.sin(radians(to.lat - from.lat) / 2) ** 2 +
    Math.cos(radians(from.lat)) *
      Math.cos(radians(to.lat)) *
      Math.sin(radians(to.lng - from.lng) / 2) ** 2
  return (
    2 * earthRadiusM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))))
  )
}

/** 반경 검색용 직선거리이며 도보 경로 거리나 순서 최적화에 사용하지 않는다. */
export function withinRadius(
  lots: StoredParkingLot[],
  query: ParkingSearch,
): ParkingLot[] {
  searchBounds(query)
  return lots
    .map((lot) => ({
      ...lot,
      location: { ...lot.location },
      fee: lot.fee === null ? null : { ...lot.fee },
      distanceToWaypointM: distanceM(query.center, lot.location),
    }))
    .filter((lot) => lot.distanceToWaypointM <= query.radiusM)
    .sort(
      (a, b) =>
        a.distanceToWaypointM - b.distanceToWaypointM ||
        a.id.localeCompare(b.id),
    )
}
