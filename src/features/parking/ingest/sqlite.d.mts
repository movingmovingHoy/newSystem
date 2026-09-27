import type { StoredParkingLot } from './snapshot'
import type { SearchBounds } from '../providers/geo'

export interface ParkingDatabase {
  count(): number
  lastUpdatedDay(): string | null
  readBounds(bounds: SearchBounds): StoredParkingLot[]
  replace(lots: StoredParkingLot[], day: string): void
  close(): void
}
/** Node 22.13 이상 필요. 파일 경로 또는 :memory:를 받는다. */
export function openParkingDatabase(path: string): ParkingDatabase
