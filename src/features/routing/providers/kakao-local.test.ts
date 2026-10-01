import { describe, it, expect, vi, afterEach } from 'vitest'
import { searchPlaces, relevanceRank } from './kakao-local'

/**
 * 카카오 로컬 키워드 검색 provider.
 * 외부 API는 mock 처리(AGENTS.md 15장). 여기서는 검색어 관련도 재정렬을 검증한다.
 */

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('relevanceRank', () => {
  it('완전일치 < 접두일치 < 중간포함 < 미포함 순으로 점수가 커진다', () => {
    expect(relevanceRank('성수', '성수')).toBe(0)
    expect(relevanceRank('성수카페거리', '성수')).toBe(1)
    expect(relevanceRank('서울숲 성수점', '성수')).toBe(2)
    expect(relevanceRank('서울숲카페거리', '성수')).toBe(3)
  })
})

describe('searchPlaces 관련도 정렬', () => {
  it('이름 접두 일치(성수카페거리)를 카카오 순서보다 위로 올린다', async () => {
    // 카카오가 서울숲카페거리를 먼저 주더라도 "성수"에 더 잘 맞는 쪽이 1등
    mockFetchOnce({
      documents: [
        {
          place_name: '서울숲카페거리',
          road_address_name: '서울 성동구 왕십리로 100',
          x: '127.0400',
          y: '37.5440',
        },
        {
          place_name: '성수카페거리',
          road_address_name: '서울 성동구 연무장길 1',
          x: '127.0558',
          y: '37.5447',
        },
      ],
    })

    const results = await searchPlaces('성수')
    expect(results[0].name).toBe('성수카페거리')
    expect(results[1].name).toBe('서울숲카페거리')
  })

  it('관련도가 같으면 카카오 원래 순서를 유지한다', async () => {
    mockFetchOnce({
      documents: [
        { place_name: '성수역 1번출구', x: '127.0557', y: '37.5447' },
        { place_name: '성수역 2번출구', x: '127.0560', y: '37.5450' },
      ],
    })

    const results = await searchPlaces('성수역')
    expect(results.map((r) => r.name)).toEqual([
      '성수역 1번출구',
      '성수역 2번출구',
    ])
  })

  it('빈 검색어는 빈 배열', async () => {
    const results = await searchPlaces('   ')
    expect(results).toEqual([])
  })
})

describe('searchPlaces 다중 페이지', () => {
  it('뒤 페이지에 있는 결과도 받아와 관련도 정렬로 위로 올린다', async () => {
    // 1페이지: is_end=false (관련 없는 결과), 2페이지: 성수동카페거리 포함, is_end=true
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documents: [
            { place_name: '성수역사거리', x: '127.056', y: '37.544' },
          ],
          meta: { is_end: false },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          documents: [
            { place_name: '성수동카페거리', x: '127.0558', y: '37.5447' },
          ],
          meta: { is_end: true },
        }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchPlaces('성수동카페거리')
    // 2페이지까지 받아왔다
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // 정확히 일치하는 성수동카페거리가 1등
    expect(results[0].name).toBe('성수동카페거리')
    expect(results.map((r) => r.name)).toContain('성수역사거리')
  })

  it('is_end가 true면 다음 페이지를 받지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        documents: [{ place_name: '성수역', x: '127.056', y: '37.544' }],
        meta: { is_end: true },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await searchPlaces('성수역')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('페이지 경계에서 겹치는 결과는 중복 제거한다', async () => {
    const dup = { place_name: '성수역', x: '127.056', y: '37.544' }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documents: [dup], meta: { is_end: false } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ documents: [dup], meta: { is_end: true } }),
      })
    vi.stubGlobal('fetch', fetchMock)

    const results = await searchPlaces('성수역')
    expect(results.filter((r) => r.name === '성수역')).toHaveLength(1)
  })
})
