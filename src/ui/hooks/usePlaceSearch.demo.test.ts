import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

// 데모 모드에서는 카카오 검색을 절대 부르지 않는다.
vi.mock('@features/routing/providers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/routing/providers')>()),
  searchPlaces: vi.fn(() => Promise.reject(new Error('호출되면 안 됨'))),
}))

import { searchPlaces } from '@features/routing/providers'
import { usePlaceSearch } from './usePlaceSearch'

afterEach(() => vi.unstubAllEnvs())

describe('usePlaceSearch 데모 모드', () => {
  it('카카오를 부르지 않고 샘플 장소에서 바로 결과를 준다', () => {
    vi.stubEnv('VITE_DEMO', 'true')
    const { result } = renderHook(() => usePlaceSearch('시청', 'origin', true))
    expect(result.current.results.map((p) => p.name)).toContain('서울시청')
    expect(result.current.loading).toBe(false)
    expect(searchPlaces).not.toHaveBeenCalled()
  })

  it('두 글자 미만이면 결과가 없다', () => {
    vi.stubEnv('VITE_DEMO', 'true')
    const { result } = renderHook(() => usePlaceSearch('시', 'origin', true))
    expect(result.current.results).toEqual([])
  })
})
