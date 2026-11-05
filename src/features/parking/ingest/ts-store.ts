/** 서버 전용. 서울시 DB와 별도의 공단 전용 DB를 전달한다. */
import type { ParkingDatabase } from './sqlite.mjs'
import { ParkingSnapshotStore } from './seoul-store'
import {
  fetchTsParkingSnapshot,
  type TsParkingOptions,
} from '../providers/ts-parking'
export function createTsParkingStore(
  database: ParkingDatabase,
  key: string,
  options: TsParkingOptions = {},
) {
  return new ParkingSnapshotStore(database, () =>
    fetchTsParkingSnapshot(key, options),
  )
}
