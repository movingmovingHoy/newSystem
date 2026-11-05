/**
 * 서버 전용. 인증키를 브라우저에 전달하지 않도록 공개 barrel에서 내보내지 않는다.
 * 서울시 실시간 주차(GetParkingInfo): 총 주차면, 현재 주차 대수, 갱신 시각. AGENTS.md 8-2.
 * 응답에 좌표가 없어 시설 DB(`seoul:{PKLT_CD}`)와 id 로 조인해서 쓴다.
 */

export type SeoulLiveRow = {
  /** `seoul:{PKLT_CD}` — 시설 DB(seoul.ts)의 id 와 같은 체계 */
  id: string
  /** 총 주차면 */
  capacity: number
  /** 현재 주차 대수 */
  current: number
  /** 갱신 시각 (ISO 8601, UTC) */
  updatedAt: string
}

type Row = Record<string, unknown>

const num = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (String(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : ''

/** "2026-11-05 18:59:23" (한국 시각) → ISO. 해석할 수 없으면 null */
function kstToIso(value: unknown): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(text(value))
  if (!match) return null
  const time = Date.parse(`${match[1]}T${match[2]}+09:00`)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

/**
 * 응답 행을 정규화한다. 값이 비었거나 잘못된 행은 버린다 (0으로 채우지 않는다).
 * 같은 주차장 코드가 반복되면 마지막 행을 쓴다 (이중 집계 방지).
 */
export function normalizeSeoulLiveRows(rows: unknown[]): SeoulLiveRow[] {
  const result = new Map<string, SeoulLiveRow>()
  for (const value of rows) {
    const row: Row = value && typeof value === 'object' ? (value as Row) : {}
    const code = text(row.PKLT_CD)
    const capacity = num(row.TPKCT)
    const current = num(row.NOW_PRK_VHCL_CNT)
    const updatedAt = kstToIso(row.NOW_PRK_VHCL_UPDT_TM)
    if (
      !code ||
      capacity === null ||
      capacity <= 0 ||
      current === null ||
      current < 0 ||
      updatedAt === null
    )
      continue
    const id = `seoul:${code}`
    result.set(id, { id, capacity, current, updatedAt })
  }
  return [...result.values()]
}

export async function fetchSeoulLiveParking(
  key: string,
  options: { fetcher?: typeof fetch; pageSize?: number } = {},
): Promise<SeoulLiveRow[]> {
  if (!key.trim())
    throw new Error('서울시 주차장 인증키 SEOUL_PARKING_KEY가 필요합니다.')
  const pageSize = options.pageSize ?? 1000
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000)
    throw new RangeError('조회 단위는 1~1000입니다.')
  const fetcher = options.fetcher ?? fetch
  const rows: unknown[] = []
  let total: number | null = null
  do {
    const start = rows.length + 1
    const end =
      total === null
        ? start + pageSize - 1
        : Math.min(total, start + pageSize - 1)
    let response: Response
    try {
      response = await fetcher(
        `http://openapi.seoul.go.kr:8088/${encodeURIComponent(key.trim())}/json/GetParkingInfo/${start}/${end}/`,
        { signal: AbortSignal.timeout(15000) },
      )
    } catch {
      // fetch 예외에는 키가 있는 URL이 포함될 수 있어 원본 예외를 전달하지 않는다.
      throw new Error('서울시 실시간 주차 API 통신에 실패했습니다.')
    }
    if (!response.ok)
      throw new Error(`서울시 실시간 주차 API HTTP ${response.status}`)
    let data: {
      GetParkingInfo?: {
        RESULT?: { CODE?: unknown }
        list_total_count?: unknown
        row?: unknown
      }
      RESULT?: { CODE?: unknown }
    }
    try {
      const parsed: unknown = await response.json()
      if (!parsed || typeof parsed !== 'object') throw new Error()
      data = parsed as typeof data
    } catch {
      throw new Error('서울시 실시간 주차 응답을 해석할 수 없습니다.')
    }
    const page = data?.GetParkingInfo
    const code = page?.RESULT?.CODE ?? data?.RESULT?.CODE
    if (code !== 'INFO-000' || !page) {
      // 응답 메시지 대신 제한된 코드만 노출한다.
      const safeCode =
        typeof code === 'string' && /^(INFO|ERROR)-\d{3}$/.test(code)
          ? code
          : '응답 오류'
      throw new Error(`서울시 실시간 주차 조회 실패 (${safeCode})`)
    }
    const count = num(page.list_total_count)
    if (
      count === null ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 100000 ||
      (total !== null && total !== count) ||
      !Array.isArray(page.row) ||
      page.row.length === 0
    )
      throw new Error('서울시 실시간 주차 응답이 불완전합니다.')
    total = count
    rows.push(...page.row)
  } while (rows.length < total)
  return normalizeSeoulLiveRows(rows)
}
