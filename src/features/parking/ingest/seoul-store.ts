/**
 * 서버 전용: 주차 검색이 발생한 날 한 번 갱신한다. 자동 스케줄러는 등록하지 않는다.
 *
 * 개발 단계 동작 (AGENTS.md 10장):
 *  - DB 가 비어 있는 첫 수집: 끝날 때까지 기다린다 (보여줄 데이터가 없다).
 *  - 날짜가 바뀐 뒤: 어제 데이터로 바로 응답하고 뒤에서 갱신한다. 전체 수집은 수 분이
 *    걸려서, 하루 첫 사용자가 멈춘 화면을 보지 않게 하려는 것이다.
 *  - 뒤 갱신이 실패하면 오류 대신 기존 데이터를 계속 쓰고 서버 로그(console.warn)에 남긴다.
 *    실패가 이어질 때 클릭마다 API 를 부르지 않도록 PARKING_REFRESH_RETRY_MIN 동안 쉰다.
 *  - 배포 단계에서는 요청과 무관한 하루 1회 배치로 옮긴다.
 */
import type { ParkingDatabase } from './sqlite.mjs'
import type { ParkingSnapshot } from './snapshot'
import type {
  ParkingProvider,
  ParkingSearch,
  Availability,
} from '../providers/types'
import { SqliteParkingProvider } from '../providers/sqlite'
import { searchBounds } from '../providers/geo'
// vite.config.ts 가 서버 플러그인으로 불러오는 파일이라 '@shared' 별칭은 쓸 수 없다
// (설정 파일을 읽을 때는 별칭이 적용되지 않는다). 값은 상대 경로로 가져온다.
import { PARKING_REFRESH_RETRY_MIN } from '../../../shared/config/constants'
import { ingestParkingSnapshot } from './snapshot'

export class ParkingSnapshotStore implements ParkingProvider {
  private pending: Promise<void> | null = null
  /** 뒤 갱신이 마지막으로 실패한 시각 (ms). 쉬는 시간 계산용 */
  private lastBackgroundFailureAt: number | null = null
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

  /** 오늘(KST) 날짜. YYYY-MM-DD */
  private today(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(this.now())
  }

  /**
   * 검색 전에 데이터를 준비한다.
   * 비어 있으면 기다리고, 날짜만 지났으면 어제 데이터로 먼저 응답하고 뒤에서 갱신한다.
   */
  private async prepare(): Promise<void> {
    if (this.database.count() === 0) return this.refresh()
    if (this.database.lastUpdatedDay() === this.today()) return
    this.refreshInBackground()
  }

  private refreshInBackground(): void {
    if (this.pending) return
    const now = this.now().getTime()
    if (
      this.lastBackgroundFailureAt !== null &&
      now - this.lastBackgroundFailureAt < PARKING_REFRESH_RETRY_MIN * 60_000
    )
      return
    const since = this.database.lastUpdatedDay()
    console.warn(
      `[parking] 주차 시설 DB(${since} 기준)가 오래되어 어제 데이터로 먼저 응답하고 뒤에서 갱신합니다.`,
    )
    this.refresh().then(
      () => {
        this.lastBackgroundFailureAt = null
      },
      (error: unknown) => {
        this.lastBackgroundFailureAt = this.now().getTime()
        const reason =
          error instanceof Error ? error.message : '알 수 없는 오류'
        console.warn(
          `[parking] 뒤 갱신 실패: ${reason}. ${since} 기준 데이터를 계속 사용하며 ${PARKING_REFRESH_RETRY_MIN}분 뒤 다시 시도합니다.`,
        )
      },
    )
  }

  async refresh(): Promise<void> {
    if (this.pending) return this.pending
    const now = this.now()
    const day = this.today()
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
    await this.prepare()
    return this.provider.search(query)
  }

  async getAvailability(_lotId: string): Promise<Availability> {
    return { status: 'unknown' }
  }
}

// 기존 서울시 호출부 호환. 동일한 저장 절차를 공단 전용 DB에도 사용한다.
export { ParkingSnapshotStore as SeoulParkingStore }
