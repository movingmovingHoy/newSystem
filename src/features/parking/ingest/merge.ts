import { distanceM } from '../providers/geo'
import { normalizeParkingSnapshot, type ParkingSnapshot } from './snapshot'

// 이름의 기관 표기·일반 접미사만 제거한다. 이름이 다른 시설을 거리만으로 합치지 않는다.
const nameKey = (name: string) =>
  name
    .normalize('NFKC')
    .replace(/\((시|구)\)$/g, '')
    .replace(/공영|주차장|\s/g, '')
    .toLowerCase()
export function mergeParkingSnapshots(
  seoul: ParkingSnapshot,
  ts: ParkingSnapshot,
) {
  const a = normalizeParkingSnapshot(seoul),
    b = normalizeParkingSnapshot(ts)
  const matches = b.map((lot) =>
    a.filter(
      (other) =>
        nameKey(lot.name).length >= 2 &&
        nameKey(lot.name) === nameKey(other.name) &&
        distanceM(lot.location, other.location) <= 75,
    ),
  )
  const counts = new Map<string, number>()
  for (const candidates of matches)
    for (const lot of candidates)
      counts.set(lot.id, (counts.get(lot.id) ?? 0) + 1)
  const result = new Map(a.map((lot) => [lot.id, { ...lot }]))
  let mergedCount = 0
  b.forEach((lot, index) => {
    const candidates = matches[index]
    if (candidates.length === 1 && counts.get(candidates[0].id) === 1) {
      const existing = result.get(candidates[0].id)!
      if (existing.fee === null) existing.fee = lot.fee
      mergedCount++
    } else result.set(lot.id, lot)
  })
  const lots = [...result.values()]
  const snapshot: ParkingSnapshot = {
    facilities: lots.map((lot) => ({
      id: lot.id,
      name: lot.name,
      region: '서울특별시',
      location: lot.location,
    })),
    operations: lots.map((lot) => ({ id: lot.id, fee: lot.fee })),
  }
  return { snapshot, mergedCount }
}
