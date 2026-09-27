import type { ParkingDatabase } from '../ingest/sqlite.mjs'
import type { ParkingProvider, ParkingSearch, Availability } from './types'
import { searchBounds, withinRadius } from './geo'

/** 서버 전용: DB에서 좌표 범위를 좁힌 뒤 원형 반경을 검증한다. */
export class SqliteParkingProvider implements ParkingProvider {
  private readonly database: ParkingDatabase
  constructor(database: ParkingDatabase) {
    this.database = database
  }
  async search(query: ParkingSearch) {
    return withinRadius(this.database.readBounds(searchBounds(query)), query)
  }
  async getAvailability(_lotId: string): Promise<Availability> {
    return { status: 'unknown' }
  }
}
