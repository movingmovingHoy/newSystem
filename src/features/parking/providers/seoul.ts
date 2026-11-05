/** 서버 전용. 인증키를 브라우저에 전달하지 않도록 공개 barrel에서 내보내지 않는다. */
import type { FeeInfo } from '@shared/types'
import type { ParkingSnapshot } from '../ingest/snapshot'

type Row = Record<string, unknown>
export type SeoulParkingSnapshot = {
  snapshot: ParkingSnapshot
  sourceRows: number
  skippedRows: number
  duplicateRows: number
}
const number = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (String(value).trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : ''

function feeFor(row: Row): FeeInfo | null {
  if (text(row.CHGD_FREE_NM) === '무료')
    return { baseFee: 0, baseTimeMin: 0, addFee: 0, addTimeMin: 1 }
  if (text(row.CHGD_FREE_NM) !== '유료') return null
  const baseFee = number(row.PRK_CRG),
    baseTimeMin = number(row.PRK_HM)
  const addFee = number(row.ADD_CRG),
    addTimeMin = number(row.ADD_UNIT_TM_MNT)
  if (
    baseFee === null ||
    baseTimeMin === null ||
    baseTimeMin <= 0 ||
    addFee === null ||
    addTimeMin === null ||
    addTimeMin <= 0 ||
    (baseFee === 0 && addFee === 0)
  )
    return null
  const dailyMaxFee = number(row.DLY_MAX_CRG)
  return {
    baseFee,
    baseTimeMin,
    addFee,
    addTimeMin,
    ...(dailyMaxFee !== null && dailyMaxFee > 0 ? { dailyMaxFee } : {}),
  }
}

/** GetParkInfo 기본요금 기준. 공휴일·야간 무료 및 할인은 반영하지 않는 예상값이다. */
export function normalizeSeoulParkingRows(
  rows: unknown[],
): SeoulParkingSnapshot {
  const facilities = new Map<string, ParkingSnapshot['facilities'][number]>()
  const operations = new Map<string, FeeInfo | null>()
  let skippedRows = 0,
    duplicateRows = 0
  for (const value of rows) {
    const row: Row = value && typeof value === 'object' ? (value as Row) : {}
    const code = text(row.PKLT_CD),
      name = text(row.PKLT_NM)
    const lat = number(row.LAT),
      lng = number(row.LOT)
    // 이 서비스는 서울 주차장 데이터다. 0,0 및 한반도 밖 좌표는 검색에 사용하지 않는다.
    if (
      /관광버스|버스\s*전용|화물|나눔카|거주자\s*(우선|전용)/.test(name) ||
      !code ||
      !name ||
      lat === null ||
      lng === null ||
      lat < 33 ||
      lat > 39 ||
      lng < 124 ||
      lng > 132
    ) {
      skippedRows++
      continue
    }
    const id = `seoul:${code}`,
      fee = feeFor(row)
    if (facilities.has(id)) {
      duplicateRows++
      if (JSON.stringify(operations.get(id)) !== JSON.stringify(fee))
        operations.set(id, null)
      continue
    }
    facilities.set(id, {
      id,
      name,
      region: '서울특별시',
      location: { lat, lng },
    })
    operations.set(id, fee)
  }
  return {
    snapshot: {
      facilities: [...facilities.values()],
      operations: [...operations].map(([id, fee]) => ({ id, fee })),
    },
    sourceRows: rows.length,
    skippedRows,
    duplicateRows,
  }
}

export async function fetchSeoulParkingSnapshot(
  key: string,
  options: {
    fetcher?: typeof fetch
    pageSize?: number
  } = {},
): Promise<SeoulParkingSnapshot> {
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
        `http://openapi.seoul.go.kr:8088/${encodeURIComponent(key.trim())}/json/GetParkInfo/${start}/${end}/`,
        { signal: AbortSignal.timeout(30000) },
      )
    } catch {
      // fetch 예외에는 키가 있는 URL이 포함될 수 있어 원본 예외를 전달하지 않는다.
      throw new Error(
        '서울시 주차장 API 통신에 실패했습니다. 잠시 후 다시 시도해주세요.',
      )
    }
    if (!response.ok)
      throw new Error(`서울시 주차장 API HTTP ${response.status}`)
    let data: {
      GetParkInfo?: {
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
      throw new Error('서울시 주차장 응답을 해석할 수 없습니다.')
    }
    const page = data?.GetParkInfo
    const code = page?.RESULT?.CODE ?? data?.RESULT?.CODE
    if (code !== 'INFO-000' || !page) {
      // 응답 메시지 대신 제한된 코드만 노출한다.
      const safeCode =
        typeof code === 'string' && /^(INFO|ERROR)-\d{3}$/.test(code)
          ? code
          : '응답 오류'
      throw new Error(`서울시 주차장 조회 실패 (${safeCode})`)
    }
    const count = number(page.list_total_count)
    if (
      count === null ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 100000 ||
      (total !== null && total !== count) ||
      !Array.isArray(page.row)
    )
      throw new Error(
        '서울시 주차장 응답이 불완전합니다. 기존 데이터를 유지합니다.',
      )
    total = count
    const expected = Math.min(pageSize, total - rows.length)
    if (page.row.length !== expected)
      throw new Error(
        '서울시 주차장 페이지가 불완전합니다. 기존 데이터를 유지합니다.',
      )
    rows.push(...page.row)
  } while (rows.length < total)
  return normalizeSeoulParkingRows(rows)
}
