import type { ParkingDatabase } from './sqlite.mjs'
import { ParkingSnapshotStore } from './seoul-store'
import { fetchSeoulParkingSnapshot } from '../providers/seoul'
import { fetchTsParkingSnapshot } from '../providers/ts-parking'
import { mergeParkingSnapshots } from './merge'
export function createCombinedParkingStore(
  database: ParkingDatabase,
  keys: { seoul: string; ts: string },
) {
  return new ParkingSnapshotStore(database, async () => {
    if (!keys.seoul.trim() || !keys.ts.trim())
      throw new Error('주차장 API 키 설정이 필요합니다.')
    const seoul = await fetchSeoulParkingSnapshot(keys.seoul)
    const ts = await fetchTsParkingSnapshot(keys.ts)
    return mergeParkingSnapshots(seoul.snapshot, ts.snapshot)
  })
}
