import { describe, it, expect } from 'vitest'
import { matchArea, pointInRing } from './areas'

/**
 * 좌표 → areaCode 매칭. AGENTS.md 11장.
 * 121곳 폴리곤 안이면 areaCode, 밖이면 null.
 */
describe('pointInRing (ray casting)', () => {
  // 단순 사각형 링 [lng, lat] (GeoJSON은 마지막에 시작점 반복)
  const square = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ] as [number, number][]

  it('사각형 내부 점은 true', () => {
    expect(pointInRing([5, 5], square)).toBe(true)
  })

  it('사각형 외부 점은 false', () => {
    expect(pointInRing([20, 20], square)).toBe(false)
    expect(pointInRing([-1, 5], square)).toBe(false)
  })
})

describe('matchArea (실제 121곳 데이터)', () => {
  it('영역 밖(서울 바깥, 예: 부산 좌표)이면 null', () => {
    // 부산 해운대 근처
    const code = matchArea({ lat: 35.1587, lng: 129.1604 })
    expect(code).toBeNull()
  })

  it('완전히 벗어난 좌표(태평양)도 null', () => {
    expect(matchArea({ lat: 0, lng: 0 })).toBeNull()
  })

  it('POI001(강남 MICE) 폴리곤 내부 좌표는 POI001로 매칭된다', () => {
    // 폴리곤 bbox 중심(내부 확인됨) 좌표
    const code = matchArea({ lat: 37.510897, lng: 127.059949 })
    expect(code).toBe('POI001')
  })

  it('반환된 areaCode는 존재하면 POI로 시작하는 문자열이다', () => {
    const code = matchArea({ lat: 37.510897, lng: 127.059949 })
    expect(code).not.toBeNull()
    expect(code?.startsWith('POI')).toBe(true)
  })
})
