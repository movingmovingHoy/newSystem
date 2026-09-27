import { parkingSampleSnapshot } from '../ingest/samples'
import { normalizeParkingSnapshot } from '../ingest/snapshot'
import type { StoredParkingLot } from '../ingest/snapshot'
import type { ParkingProvider, ParkingSearch, Availability } from './types'
import { withinRadius } from './geo'

/** API 키와 서버 없이 UI를 확인하기 위한 샘플 provider. */
export class SampleParkingProvider implements ParkingProvider {
  private readonly lots: StoredParkingLot[] = normalizeParkingSnapshot(
    parkingSampleSnapshot,
  )
  async search(query: ParkingSearch) {
    return withinRadius(this.lots, query)
  }
  async getAvailability(_lotId: string): Promise<Availability> {
    return { status: 'unknown' }
  }
}
