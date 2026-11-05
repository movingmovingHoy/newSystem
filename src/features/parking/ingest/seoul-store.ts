/** 서버 전용: 주차 검색이 발생한 날 한 번 갱신한다. 자동 스케줄러는 등록하지 않는다. */
import type { ParkingDatabase } from './sqlite.mjs'
import type { ParkingSnapshot } from './snapshot'
import type {
  ParkingProvider,
  ParkingSearch,
  Availability,
} from '../providers/types'
import { SqliteParkingProvider } from '../providers/sqlite'
import { searchBounds } from '../providers/geo'
import { ingestParkingSnapshot } from './snapshot'

export class ParkingSnapshotStore implements ParkingProvider {
  private pending: Promise<void> | null = null
  private readonly database: ParkingDatabase
  private readonly load: () => Promise<{ snapshot: ParkingSnapshot }>
  private readonly now: () => Date
  private readonly provider: SqliteParkingProvider

  constructor(
    database: ParkingDatabase,
    load: () => Promise<{ snapshot: ParkingSnapshot }>,
    now: () => Date = () => new Date(),
  ) {
    this.database = database
    this.load = load
    this.now = now
    this.provider = new SqliteParkingProvider(database)
  }

  async refresh(): Promise<void> {
    if (this.pending) return this.pending
    const now = this.now()
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
    if (this.database.lastUpdatedDay() === day && this.database.count() > 0)
      return
    this.pending = (async () => {
      const { snapshot } = await this.load()
      ingestParkingSnapshot(this.database, snapshot, now)
    })()
    try {
      await this.pending
    } finally {
      this.pending = null
    }
  }

  async search(query: ParkingSearch) {
    searchBounds(query)
    await this.refresh()
    return this.provider.search(query)
  }

  async getAvailability(_lotId: string): Promise<Availability> {
    return { status: 'unknown' }
  }
}

// 기존 서울시 호출부 호환. 동일한 저장 절차를 공단 전용 DB에도 사용한다.
export { ParkingSnapshotStore as SeoulParkingStore }
