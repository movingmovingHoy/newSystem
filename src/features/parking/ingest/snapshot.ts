import type { FeeInfo, LatLng, ParkingLot } from '@shared/types'
import { calculateParkingFee } from '../fee'
import { validateLocation } from '../providers/geo'
import type { ParkingDatabase } from './sqlite.mjs'

export type StoredParkingLot = Omit<
  ParkingLot,
  'distanceToWaypointM' | 'availability'
>
/** 내부 적재 모델이다. 실제 교통안전공단 응답 스키마를 가정하지 않는다. */
export type ParkingSnapshot = {
  facilities: { id: string; name: string; region: string; location: LatLng }[]
  operations: { id: string; fee: FeeInfo | null }[]
}

export function normalizeParkingSnapshot(
  snapshot: ParkingSnapshot,
): StoredParkingLot[] {
  const fees = new Map<string, FeeInfo | null>()
  for (const operation of snapshot.operations) {
    if (fees.has(operation.id))
      throw new Error(`중복 운영정보: ${operation.id}`)
    let fee = operation.fee
    try {
      calculateParkingFee(fee, 1)
    } catch {
      fee = null
    }
    fees.set(operation.id, fee === null ? null : { ...fee })
  }
  const ids = new Set<string>()
  return snapshot.facilities
    .filter((facility) => facility.region === '서울특별시')
    .map((facility) => {
      if (!facility.id.trim() || !facility.name.trim())
        throw new Error('주차장 관리번호와 이름이 필요합니다.')
      if (ids.has(facility.id)) throw new Error(`중복 시설정보: ${facility.id}`)
      ids.add(facility.id)
      validateLocation(facility.location)
      return {
        id: facility.id,
        name: facility.name,
        location: { ...facility.location },
        fee: fees.get(facility.id) ?? null,
      }
    })
}

/** 호출 시 KST 날짜가 바뀌었을 때만 교체한다. 실행 스케줄러는 별도로 연결한다. */
export function ingestParkingSnapshot(
  database: ParkingDatabase,
  snapshot: ParkingSnapshot,
  now = new Date(),
): { updated: boolean; count: number } {
  if (!Number.isFinite(now.getTime()))
    throw new RangeError('올바른 적재 시각이 필요합니다.')
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  if (database.lastUpdatedDay() === day)
    return { updated: false, count: database.count() }
  const lots = normalizeParkingSnapshot(snapshot)
  if (lots.length === 0)
    throw new Error(
      '서울 주차장이 없는 스냅샷으로 기존 데이터를 교체할 수 없습니다.',
    )
  database.replace(lots, day)
  return { updated: true, count: lots.length }
}
