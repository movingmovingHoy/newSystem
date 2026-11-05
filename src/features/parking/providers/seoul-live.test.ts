// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { fetchSeoulLiveParking, normalizeSeoulLiveRows } from './seoul-live'

/**
 * 서울시 실시간 주차(GetParkingInfo). 서버 전용.
 * 총 주차면·현재 대수·갱신 시각만 쓰고, 좌표는 시설 DB와 id 로 조인한다(여기엔 좌표가 없다).
 */

const row = (over: Record<string, unknown> = {}) => ({
  PKLT_CD: '1001',
  PKLT_NM: '세종로 공영주차장(시)',
  TPKCT: '1260.0',
  NOW_PRK_VHCL_CNT: '754.0',
  NOW_PRK_VHCL_UPDT_TM: '2026-11-05 18:59:23',
  ...over,
})

const page = (rows: unknown[], total = rows.length) => ({
  ok: true,
  status: 200,
  json: async () => ({
    GetParkingInfo: {
      list_total_count: total,
      RESULT: { CODE: 'INFO-000' },
      row: rows,
    },
  }),
})

describe('normalizeSeoulLiveRows', () => {
  it('문자열 숫자를 읽고 한국 시각(KST)을 ISO 로 바꾼다', () => {
    const [lot] = normalizeSeoulLiveRows([row()])
    expect(lot).toEqual({
      id: 'seoul:1001',
      capacity: 1260,
      current: 754,
      // 18:59:23 KST = 09:59:23 UTC
      updatedAt: '2026-11-05T09:59:23.000Z',
    })
  })

  it('값이 비었거나 잘못된 행은 버린다 (0으로 채우지 않는다)', () => {
    const rows = normalizeSeoulLiveRows([
      row({ PKLT_CD: 'ok' }),
      row({ PKLT_CD: 'zero-cap', TPKCT: '0' }),
      row({ PKLT_CD: 'no-cur', NOW_PRK_VHCL_CNT: '' }),
      row({ PKLT_CD: 'neg-cur', NOW_PRK_VHCL_CNT: '-3' }),
      row({ PKLT_CD: 'bad-time', NOW_PRK_VHCL_UPDT_TM: 'yesterday' }),
      row({ PKLT_CD: '' }),
      null,
      'garbage',
    ])
    expect(rows.map((r) => r.id)).toEqual(['seoul:ok'])
  })
})

describe('fetchSeoulLiveParking', () => {
  it('GetParkingInfo 를 호출하고 정규화한 목록을 돌려준다', async () => {
    const fetcher = vi.fn().mockResolvedValue(page([row()]))
    const lots = await fetchSeoulLiveParking('my key', {
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(lots).toHaveLength(1)
    const url = String(fetcher.mock.calls[0][0])
    expect(url).toContain('/json/GetParkingInfo/1/1000/')
    expect(url).toContain('my%20key') // 키는 URL 인코딩
  })

  it('전체 건수가 한 페이지를 넘으면 다음 페이지도 받는다', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        page([row({ PKLT_CD: 'a' }), row({ PKLT_CD: 'b' })], 3),
      )
      .mockResolvedValueOnce(page([row({ PKLT_CD: 'c' })], 3))
    const lots = await fetchSeoulLiveParking('k', {
      fetcher: fetcher as unknown as typeof fetch,
      pageSize: 2,
    })
    expect(lots.map((l) => l.id)).toEqual(['seoul:a', 'seoul:b', 'seoul:c'])
    expect(String(fetcher.mock.calls[0][0])).toContain('/1/2/')
    expect(String(fetcher.mock.calls[1][0])).toContain('/3/3/')
  })

  it('키가 없으면 호출 전에 실패한다', async () => {
    const fetcher = vi.fn()
    await expect(
      fetchSeoulLiveParking('  ', {
        fetcher: fetcher as unknown as typeof fetch,
      }),
    ).rejects.toThrow('SEOUL_PARKING_KEY')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('응답 코드가 실패면 던지되 키를 오류에 담지 않는다', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        RESULT: { CODE: 'INFO-200', MESSAGE: 'secret-key' },
      }),
    })
    const error = await fetchSeoulLiveParking('secret-key', {
      fetcher: fetcher as unknown as typeof fetch,
    }).catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain('secret-key')
  })

  it('통신 예외에 URL(키)이 있어도 그대로 전달하지 않는다', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValue(new Error('GET http://x/secret-key/json failed'))
    const error = await fetchSeoulLiveParking('secret-key', {
      fetcher: fetcher as unknown as typeof fetch,
    }).catch((e: Error) => e)
    expect((error as Error).message).not.toContain('secret-key')
  })
})
