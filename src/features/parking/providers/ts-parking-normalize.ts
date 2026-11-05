import type { FeeInfo } from '@shared/types'
import type { ParkingSnapshot } from '../ingest/snapshot'

type Row = Record<string, unknown>
const rowOf = (x: unknown): Row =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Row) : {}
const text = (x: unknown) =>
  typeof x === 'string' || typeof x === 'number' ? String(x).trim() : ''
const number = (x: unknown) =>
  text(x) !== '' && Number.isFinite(Number(text(x))) && Number(text(x)) >= 0
    ? Number(text(x))
    : null

function operationFee(value: unknown): FeeInfo | null {
  const row = rowOf(value)
  // 회차 무료시간의 초과 시 과금 정책은 현재 모델로 표현하지 못한다.
  if (number(row.opertn_bs_free_time) !== 0) return null
  const tariffs = Array.isArray(row.basic_info)
    ? row.basic_info
    : [row.basic_info]
  if (tariffs.length !== 1) return null
  const info = rowOf(tariffs[0])
  const baseFee = number(info.parking_chrge_bs_chrge),
    baseTimeMin = number(info.parking_chrge_bs_time),
    addFee = number(info.parking_chrge_adit_unit_chrge),
    addTimeMin = number(info.parking_chrge_adit_unit_time)
  // 유료 시설의 추가요금 0은 미기재 가능성이 있으므로 무료 연장으로 추정하지 않는다.
  if (
    baseFee === null ||
    baseFee <= 0 ||
    baseTimeMin === null ||
    baseTimeMin <= 0 ||
    addFee === null ||
    addFee <= 0 ||
    addTimeMin === null ||
    addTimeMin <= 0
  )
    return null
  // fxamt_info의 1일 정액은 자동 상한이 아니므로 dailyMaxFee로 변환하지 않는다.
  return { baseFee, baseTimeMin, addFee, addTimeMin }
}

export function normalizeTsParkingRows(
  facilities: unknown[],
  operations: unknown[],
) {
  const fees = new Map<string, FeeInfo | null>()
  for (const value of operations) {
    const row = rowOf(value),
      id = text(row.prk_center_id)
    if (!id) continue
    const fee = operationFee(row)
    if (fees.has(id) && JSON.stringify(fees.get(id)) !== JSON.stringify(fee))
      fees.set(id, null)
    else if (!fees.has(id)) fees.set(id, fee)
  }
  const found = new Map<string, ParkingSnapshot['facilities'][number]>()
  const chargeCodes = new Map<string, string>()
  let skippedRows = 0,
    duplicateRows = 0
  for (const value of facilities) {
    const row = rowOf(value),
      id = text(row.prk_center_id),
      name = text(row.prk_plce_nm)
    const lat = number(row.prk_plce_entrc_la),
      lng = number(row.prk_plce_entrc_lo)
    if (
      text(row.prk_plce_adres_sido) !== '서울특별시' ||
      text(row.prk_manage_agent) !== '1' ||
      !id ||
      !name ||
      lat === null ||
      lng === null ||
      lat < 33 ||
      lat > 39 ||
      lng < 124 ||
      lng > 132 ||
      /관광버스|버스\s*전용|화물|나눔카|거주자\s*(우선|전용)/.test(name)
    ) {
      skippedRows++
      continue
    }
    const facility = {
      id: `ts:${id}`,
      name,
      region: '서울특별시',
      location: { lat, lng },
    }
    const code = text(row.parkng_chrge_se)
    if (found.has(id)) {
      duplicateRows++
      if (JSON.stringify(found.get(id)) !== JSON.stringify(facility))
        throw new Error('공단 주차장 관리번호의 시설정보가 충돌합니다.')
      if (chargeCodes.get(id) !== code) chargeCodes.set(id, 'unknown')
    } else {
      found.set(id, facility)
      chargeCodes.set(id, code)
    }
  }
  const snapshot: ParkingSnapshot = {
    facilities: [...found.values()],
    operations: [...found].map(([id, facility]) => ({
      id: facility.id,
      fee:
        chargeCodes.get(id) === '1'
          ? { baseFee: 0, baseTimeMin: 0, addFee: 0, addTimeMin: 1 }
          : chargeCodes.get(id) === '2'
            ? (fees.get(id) ?? null)
            : null,
    })),
  }
  return {
    snapshot,
    sourceRows: facilities.length,
    operationRows: operations.length,
    skippedRows,
    duplicateRows,
  }
}
