import { describe, expect, it } from 'vitest'
import { findAreas, matchesKorean, registerPlace, placeById } from './catalog'
describe('실제 장소 목록', () => {
  it('121곳 전체와 한글 조합 중 검색을 지원한다', () => {
    expect(findAreas('')).toHaveLength(121)
    expect(matchesKorean('광화문·덕수궁', '광ㅎ')).toBe(true)
    expect(findAreas('광ㅎ').some((p) => p.name.includes('광화문'))).toBe(true)
    expect(findAreas('ㄱㅎㅁ').some((p) => p.name.includes('광화문'))).toBe(
      true,
    )
  })
  it('API에서 선택한 좌표를 그대로 보존한다', () => {
    const p = registerPlace({
      name: '검색 장소',
      address: '서울',
      location: { lat: 37.6, lng: 127.1 },
    })
    expect(placeById(p.id).location).toEqual({ lat: 37.6, lng: 127.1 })
  })
})
