// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { normalizeTsParkingRows } from './ts-parking-normalize'
import { fetchTsParkingSnapshot } from './ts-parking'
import { normalizeParkingSnapshot } from '../ingest/snapshot'
import { calculateParkingFee } from '../fee'
const facility = {
  prk_manage_agent: '1',
  prk_center_id: 'A',
  prk_plce_nm: '공영주차장',
  prk_plce_adres_sido: '서울특별시',
  prk_plce_entrc_la: '37.57',
  prk_plce_entrc_lo: '126.98',
  parkng_chrge_se: '2',
}
const operation = {
  prk_center_id: 'A',
  opertn_bs_free_time: '0',
  basic_info: {
    parking_chrge_bs_time: '30',
    parking_chrge_bs_chrge: '1000',
    parking_chrge_adit_unit_time: '10',
    parking_chrge_adit_unit_chrge: '500',
  },
  fxamt_info: { parking_chrge_one_day_chrge: '2000' },
}
const response = (
  field: string,
  rows: unknown[],
  count = rows.length,
  pageNo = 1,
) =>
  new Response(
    JSON.stringify({
      resultCode: '0',
      totalCount: count,
      pageNo,
      [field]: rows,
    }),
  )
describe('공단 주차정보 변환', () => {
  it('관리번호로 결합하며 1일 정액을 최대요금으로 오인하지 않는다', () => {
    const r = normalizeTsParkingRows([facility], [operation])
    const [lot] = normalizeParkingSnapshot(r.snapshot)
    expect(lot.id).toBe('ts:A')
    expect(calculateParkingFee(lot.fee, 60)).toBe(2500)
    expect(lot.fee?.dailyMaxFee).toBeUndefined()
  })
  it('운영정보 누락·복수요율·무료회차·추가요금 0은 미상이다', () => {
    for (const ops of [
      [],
      [
        {
          ...operation,
          basic_info: [operation.basic_info, operation.basic_info],
        },
      ],
      [{ ...operation, opertn_bs_free_time: '10' }],
      [
        {
          ...operation,
          basic_info: {
            ...operation.basic_info,
            parking_chrge_adit_unit_chrge: '0',
          },
        },
      ],
    ]) {
      expect(
        normalizeTsParkingRows([facility], ops).snapshot.operations[0].fee,
      ).toBeNull()
    }
  })
  it('무료로 명시된 시설만 무료로 표시하고 서울 밖·좌표누락은 제외한다', () => {
    const r = normalizeTsParkingRows(
      [
        { ...facility, parkng_chrge_se: '1' },
        { ...facility, prk_center_id: 'B', prk_plce_adres_sido: '부산광역시' },
        { ...facility, prk_center_id: 'C', prk_plce_entrc_la: '' },
      ],
      [],
    )
    expect(r.snapshot.facilities).toHaveLength(1)
    expect(calculateParkingFee(r.snapshot.operations[0].fee, 60)).toBe(0)
    expect(r.skippedRows).toBe(2)
  })
  it('반복 시설은 합치고 서로 다른 시설 정보가 같은 ID이면 적재를 거절한다', () => {
    expect(normalizeTsParkingRows([facility, facility], []).duplicateRows).toBe(
      1,
    )
    expect(() =>
      normalizeTsParkingRows(
        [facility, { ...facility, prk_plce_nm: '다른 곳' }],
        [],
      ),
    ).toThrow('충돌')
  })
  it('일반 이용 가능 여부가 불명확한 민영·기타 시설을 제외한다', () => {
    const r = normalizeTsParkingRows(
      [
        { ...facility, prk_manage_agent: '2' },
        { ...facility, prk_manage_agent: '9' },
      ],
      [],
    )
    expect(r.snapshot.facilities).toHaveLength(0)
  })
  it('나눔카 전용·거주자 우선 시설을 일반 차량 후보에서 제외한다', () => {
    for (const name of ['나눔카전용대기소', '거주자 우선 주차장']) {
      expect(
        normalizeTsParkingRows([{ ...facility, prk_plce_nm: name }], [])
          .snapshot.facilities,
      ).toHaveLength(0)
    }
  })
  it('운영정보가 충돌하면 요금을 미상으로 둔다', () => {
    expect(
      normalizeTsParkingRows(
        [facility],
        [
          operation,
          {
            ...operation,
            basic_info: {
              ...operation.basic_info,
              parking_chrge_bs_chrge: '2000',
            },
          },
        ],
      ).snapshot.operations[0].fee,
    ).toBeNull()
  })
})
describe('공단 v1 조회 (mock)', () => {
  it('정확한 v1 경로와 지역 필터로 모든 페이지를 조회한다', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response('PrkSttusInfo', [facility], 2))
      .mockResolvedValueOnce(
        response('PrkSttusInfo', [{ ...facility, prk_center_id: 'B' }], 2, 2),
      )
      .mockResolvedValueOnce(response('PrkOprInfo', [operation]))
    const r = await fetchTsParkingSnapshot('a+b=', {
      fetcher,
      pageSize: 1,
      sigunguCd: '11110',
    })
    expect(r.snapshot.facilities).toHaveLength(2)
    const url = new URL(fetcher.mock.calls[0][0])
    expect(url.pathname).toBe('/B553881/Parking_v1/PrkSttusInfo_v1')
    expect(url.searchParams.get('serviceKey')).toBe('a+b=')
    expect(url.searchParams.get('sidoCd')).toBe('11')
    expect(url.searchParams.get('sigunguCd')).toBe('11110')
  })
  it('마지막 페이지 건수 차이는 다음 빈 페이지를 확인한 뒤 허용한다', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response('PrkSttusInfo', [facility], 2))
      .mockResolvedValueOnce(response('PrkSttusInfo', [], 2, 2))
      .mockResolvedValueOnce(response('PrkOprInfo', []))
    const result = await fetchTsParkingSnapshot('key', { fetcher, pageSize: 3 })
    expect(result.sourceRows).toBe(1)
    expect(result.declaredFacilityRows).toBe(2)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('짧은 중간 페이지나 마지막 뒤 추가 데이터는 거절한다', async () => {
    for (const fetcher of [
      vi.fn().mockResolvedValue(response('PrkSttusInfo', [facility], 5)),
      vi
        .fn()
        .mockResolvedValueOnce(response('PrkSttusInfo', [facility], 2))
        .mockResolvedValueOnce(response('PrkSttusInfo', [facility], 2, 2)),
    ]) {
      await expect(
        fetchTsParkingSnapshot('key', { fetcher, pageSize: 3 }),
      ).rejects.toThrow('불완전')
    }
  })
  it('큰 페이지를 사용해도 마지막 일부 페이지까지 수집한다', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response('PrkSttusInfo', [facility]))
      .mockResolvedValueOnce(response('PrkOprInfo', []))
    await fetchTsParkingSnapshot('key', { fetcher })
    expect(
      new URL(fetcher.mock.calls[0][0]).searchParams.get('numOfRows'),
    ).toBe('9999')
  })
  it('빈 운영정보는 허용하되 누락된 중간 페이지는 실패한다', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response('PrkSttusInfo', [facility]))
      .mockResolvedValueOnce(response('PrkOprInfo', []))
    expect(
      (await fetchTsParkingSnapshot('key', { fetcher })).snapshot.operations[0]
        .fee,
    ).toBeNull()
    await expect(
      fetchTsParkingSnapshot('key', {
        fetcher: vi.fn().mockResolvedValue(response('PrkSttusInfo', [], 2)),
      }),
    ).rejects.toThrow('불완전')
  })
  it('키 누락·잘못된 지역·과도한 조회 건수는 중단한다', async () => {
    const fetcher = vi.fn()
    await expect(fetchTsParkingSnapshot('', { fetcher })).rejects.toThrow(
      '인증키',
    )
    await expect(
      fetchTsParkingSnapshot('key', { fetcher, sigunguCd: '26110' }),
    ).rejects.toThrow('서울')
    await expect(
      fetchTsParkingSnapshot('key', {
        fetcher: vi
          .fn()
          .mockResolvedValue(response('PrkSttusInfo', [facility], 1001)),
        maxPages: 1,
        pageSize: 1000,
      }),
    ).rejects.toThrow()
  })
  it('일시적인 통신 오류와 서버 오류는 재시도한다', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(response('PrkSttusInfo', [facility]))
      .mockResolvedValueOnce(response('PrkOprInfo', []))
    expect((await fetchTsParkingSnapshot('key', { fetcher })).sourceRows).toBe(
      1,
    )
    expect(fetcher).toHaveBeenCalledTimes(4)
  })
  it('통신·인증 실패에 키나 원문을 노출하지 않는다', async () => {
    await expect(
      fetchTsParkingSnapshot('secret', {
        fetcher: vi.fn().mockRejectedValue(new Error('secret')),
      }),
    ).rejects.toThrow('통신 실패')
    await expect(
      fetchTsParkingSnapshot('secret', {
        fetcher: vi
          .fn()
          .mockResolvedValue(new Response('secret', { status: 403 })),
      }),
    ).rejects.toThrow('HTTP 403')
  })
})
