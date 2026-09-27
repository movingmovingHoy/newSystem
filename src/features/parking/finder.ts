import type { LatLng, ParkingLot } from '@shared/types'
import { MAX_PARKING_CANDIDATES, PARKING_RADIUS_M } from '@shared/config'
import type { ParkingProvider } from './providers'
import { calculateParkingFee } from './fee'

/**
 * provider가 반환한 경유지 기준 거리(m)로 반경을 검증한다.
 * 가까운 곳 → 최저요금 → 균형 순으로 서로 다른 주차장을 고른다.
 * 균형은 거리/요금의 상대 순위 평균, 요금 미상은 거리 순위만 사용한다.
 * 동률은 거리와 ID로 결정해 provider 응답 순서에 영향을 받지 않는다.
 */
export async function findParkingCandidates(
  provider: ParkingProvider,
  center: LatLng,
  dwellMin: number,
): Promise<ParkingLot[]> {
  calculateParkingFee(null, dwellMin)
  const lots = await provider.search({ center, radiusM: PARKING_RADIUS_M })
  const byDistance = (a: ParkingLot, b: ParkingLot) =>
    a.distanceToWaypointM - b.distanceToWaypointM || a.id.localeCompare(b.id)
  const nearby = lots
    .filter(
      (lot) =>
        Number.isFinite(lot.distanceToWaypointM) &&
        lot.distanceToWaypointM >= 0 &&
        lot.distanceToWaypointM <= PARKING_RADIUS_M,
    )
    .sort(byDistance)
  const unique = [...new Map(nearby.map((lot) => [lot.id, lot])).values()].sort(
    byDistance,
  )
  const prices = new Map(
    unique.map((lot) => [lot.id, calculateParkingFee(lot.fee, dwellMin)]),
  )
  const priced = unique
    .filter((lot) => prices.get(lot.id) !== null)
    .sort((a, b) => prices.get(a.id)! - prices.get(b.id)! || byDistance(a, b))
  // 같은 값에는 같은 순위를 부여해 거리와 원 단위를 직접 더하지 않는다.
  const balance = (lot: ParkingLot) => {
    const distanceRank =
      unique.filter(
        (other) => other.distanceToWaypointM < lot.distanceToWaypointM,
      ).length / Math.max(1, unique.length - 1)
    const price = prices.get(lot.id)!
    if (price === null) return distanceRank
    const priceRank =
      priced.filter((other) => prices.get(other.id)! < price).length /
      Math.max(1, priced.length - 1)
    return (distanceRank + priceRank) / 2
  }
  const balanced = [...unique].sort(
    (a, b) => balance(a) - balance(b) || byDistance(a, b),
  )
  const result: ParkingLot[] = []
  const add = (lot: ParkingLot | undefined) => {
    if (
      lot &&
      result.length < MAX_PARKING_CANDIDATES &&
      !result.some((item) => item.id === lot.id)
    ) {
      result.push(lot)
    }
  }
  add(unique[0])
  add(priced.find((lot) => !result.some((item) => item.id === lot.id)))
  balanced.forEach(add)
  return result
}
