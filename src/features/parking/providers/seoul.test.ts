// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { fetchSeoulParkingSnapshot, normalizeSeoulParkingRows } from './seoul'
import { normalizeParkingSnapshot } from '../ingest/snapshot'
import { calculateParkingFee } from '../fee'

const row = {
  PKLT_CD: '123',
  PKLT_NM: '테스트 공영주차장',
  ADDR: '서울특별시 중구',
  LAT: 37.5665,
  LOT: 126.978,
  CHGD_FREE_NM: '유료',
  PRK_CRG: 500,
  PRK_HM: 10,
  ADD_CRG: 250,
  ADD_UNIT_TM_MNT: 5,
  DLY_MAX_CRG: 20000,
}
const page = (rows: unknown[], total = rows.length) =>
  new Response(
    JSON.stringify({
      GetParkInfo: {
        RESULT: { CODE: 'INFO-000' },
        list_total_count: total,
        row: rows,
      },
    }),
  )

describe('서울시 공영주차장 변환', () => {
  it('위경도와 요금을 기존 모델로 변환해 체류시간 요금을 계산한다', () => {
    const result = normalizeSeoulParkingRows([row])
    const [lot] = normalizeParkingSnapshot(result.snapshot)
    expect(lot.id).toBe('seoul:123')
    expect(lot.location).toEqual({ lat: 37.5665, lng: 126.978 })
    expect(calculateParkingFee(lot.fee, 60)).toBe(3000)
    expect(calculateParkingFee(lot.fee, 1000)).toBe(20000)
  })
  it('명시된 무료만 무료로 처리하고 불완전한 유료 요금은 정보 없음으로 둔다', () => {
    const rows = [
      { ...row, PKLT_CD: 'free', CHGD_FREE_NM: '무료', ADD_UNIT_TM_MNT: 0 },
      { ...row, PKLT_CD: 'missing', ADD_UNIT_TM_MNT: 0 },
      { ...row, PKLT_CD: 'blank', PRK_CRG: '' },
      { ...row, PKLT_CD: 'zero', PRK_CRG: 0, ADD_CRG: 0 },
    ]
    const lots = normalizeParkingSnapshot(
      normalizeSeoulParkingRows(rows).snapshot,
    )
    expect(calculateParkingFee(lots[0].fee, 60)).toBe(0)
    expect(lots.slice(1).map((l) => l.fee)).toEqual([null, null, null])
  })
  it('일 최대요금 0은 무료 상한이 아니라 상한 정보 없음으로 처리한다', () => {
    const [lot] = normalizeParkingSnapshot(
      normalizeSeoulParkingRows([{ ...row, DLY_MAX_CRG: 0 }]).snapshot,
    )
    expect(lot.fee?.dailyMaxFee).toBeUndefined()
    expect(calculateParkingFee(lot.fee, 60)).toBe(3000)
  })
  it('잘못된 좌표·누락된 이름·코드는 제외하고 동일 코드는 한 번만 적재한다', () => {
    const result = normalizeSeoulParkingRows([
      row,
      row,
      { ...row, LAT: 0, LOT: 0 },
      { ...row, PKLT_NM: '' },
      { ...row, LAT: 'abc' },
    ])
    expect(result.snapshot.facilities).toHaveLength(1)
    expect(result.skippedRows).toBe(3)
    expect(result.duplicateRows).toBe(1)
  })
  it('명시적으로 버스·화물 전용인 주차장은 승용차 후보에서 제외한다', () => {
    const result = normalizeSeoulParkingRows([
      { ...row, PKLT_NM: '관광버스전용 주차장' },
      { ...row, PKLT_NM: '남대문 화물 공영주차장' },
      row,
    ])
    expect(result.snapshot.facilities).toHaveLength(1)
    expect(result.skippedRows).toBe(2)
  })
  it('나눔카 전용·거주자 우선 시설을 일반 차량 후보에서 제외한다', () => {
    for (const name of ['나눔카전용대기소', '거주자 우선 주차장']) {
      expect(
        normalizeSeoulParkingRows([{ ...row, PKLT_NM: name }]).snapshot
          .facilities,
      ).toHaveLength(0)
    }
  })
  it('같은 코드의 요금이 충돌하면 임의로 저렴한 값을 택하지 않는다', () => {
    const result = normalizeSeoulParkingRows([row, { ...row, PRK_CRG: 1000 }])
    expect(result.snapshot.operations[0].fee).toBeNull()
  })
})

describe('서울시 페이지 조회 (외부 API mock)', () => {
  it('페이지를 모두 받아 하나의 스냅샷으로 만든다', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(page([row], 2))
      .mockResolvedValueOnce(page([{ ...row, PKLT_CD: '456' }], 2))
    const result = await fetchSeoulParkingSnapshot('test-key', {
      fetcher,
      pageSize: 1,
    })
    expect(result.snapshot.facilities).toHaveLength(2)
    expect(fetcher.mock.calls[1][0]).toContain('/json/GetParkInfo/2/2/')
  })
  it('키가 없으면 외부 요청을 보내지 않는다', async () => {
    const fetcher = vi.fn()
    await expect(fetchSeoulParkingSnapshot('', { fetcher })).rejects.toThrow(
      '인증키',
    )
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('인증 오류에 키나 요청 URL을 포함하지 않는다', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          RESULT: { CODE: 'INFO-100', MESSAGE: 'secret-key' },
        }),
      ),
    )
    await expect(
      fetchSeoulParkingSnapshot('secret-key', { fetcher }),
    ).rejects.toThrow('INFO-100')
  })
  it('부분 조회·네트워크 오류·HTTP 실패를 정상 데이터로 사용하지 않는다', async () => {
    const partial = vi.fn().mockResolvedValue(page([], 2))
    await expect(
      fetchSeoulParkingSnapshot('secret', { fetcher: partial }),
    ).rejects.toThrow('불완전')
    const network = vi.fn().mockRejectedValue(new Error('URL contains secret'))
    await expect(
      fetchSeoulParkingSnapshot('secret', { fetcher: network }),
    ).rejects.toThrow('통신')
    const http = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    await expect(
      fetchSeoulParkingSnapshot('secret', { fetcher: http }),
    ).rejects.toThrow('503')
  })
})
