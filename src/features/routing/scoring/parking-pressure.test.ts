import { describe, it, expect } from 'vitest'
import {
  congestionBonus,
  evaluateParkingPressure,
  parkingPressureReasons,
} from './parking-pressure'

/**
 * 목적지 주차 압박. AGENTS.md 8-2.
 * 압박점수 = 포화율(0~100) + 혼잡도 가산(0~20), 70 이상이면 추천.
 * 화면에는 구성(포화율 + 혼잡 가산)을 드러내지 않고 "주차 혼잡 점수" 하나로만 보여준다.
 */

describe('congestionBonus', () => {
  it('혼잡 단계 0~3을 0~20점으로 선형 환산한다', () => {
    expect(congestionBonus(0)).toBe(0)
    expect(congestionBonus(1)).toBeCloseTo(20 / 3)
    expect(congestionBonus(2)).toBeCloseTo(40 / 3)
    expect(congestionBonus(3)).toBe(20)
  })

  it('혼잡 정보가 없으면(null) 가산 0이다', () => {
    expect(congestionBonus(null)).toBe(0)
  })

  it('범위를 벗어난 단계는 0~20으로 제한한다', () => {
    expect(congestionBonus(9)).toBe(20)
    expect(congestionBonus(-1)).toBe(0)
  })
})

describe('evaluateParkingPressure', () => {
  const run = (occupancyRatio: number, congestionLevel: number | null) =>
    evaluateParkingPressure({ occupancyRatio, congestionLevel })

  it('포화 70%만으로 기준(70)에 닿아 추천한다', () => {
    const r = run(0.7, 0)
    expect(r.score).toBe(70)
    expect(r.recommended).toBe(true)
  })

  it('포화 50% + 붐빔(20점) = 70 이면 추천한다', () => {
    const r = run(0.5, 3)
    expect(r.score).toBe(70)
    expect(r.congestionBonus).toBe(20)
    expect(r.recommended).toBe(true)
  })

  it('포화 40% + 붐빔 = 60 이면 추천하지 않는다', () => {
    const r = run(0.4, 3)
    expect(r.score).toBe(60)
    expect(r.recommended).toBe(false)
  })

  it('포화 69% + 혼잡 정보 없음 = 69 이면 추천하지 않는다', () => {
    const r = run(0.69, null)
    expect(r.score).toBe(69)
    expect(r.congestionBonus).toBe(0)
    expect(r.recommended).toBe(false)
  })

  it('부동소수점 오차로 경계값이 어긋나지 않는다', () => {
    // 포화 60% + 보통(6.67) = 66.67 → 미추천, 포화 60% + 약간 붐빔(13.33) = 73.33 → 추천
    expect(run(0.6, 1).recommended).toBe(false)
    expect(run(0.6, 2).recommended).toBe(true)
  })

  it('결과에 포화율을 그대로 담는다', () => {
    expect(run(0.42, 1).occupancyRatio).toBe(0.42)
  })
})

describe('parkingPressureReasons', () => {
  const dest = (ratio: number, level: number | null) =>
    evaluateParkingPressure({ occupancyRatio: ratio, congestionLevel: level })

  it('추천이면 포화율·주차 혼잡 점수·추천 문구를 담고 구성은 드러내지 않는다', () => {
    const reasons = parkingPressureReasons(dest(0.7, 2), { ratio: 0.3 })
    const text = reasons.join(' | ')
    expect(text).toContain('목적지 주변 주차 포화 70%')
    expect(text).toContain('주차 혼잡 점수 83점')
    expect(text).toContain('주차 후 대중교통 추천')
    // 포화율 + 혼잡 가산이라는 내부 구성은 화면에 나오지 않는다
    expect(text).not.toContain('혼잡 가산')
    expect(text).not.toContain('압박')
  })

  it('추천 기준 미만이면 주차 여유 근거를 담고 추천 문구는 없다', () => {
    const text = parkingPressureReasons(dest(0.45, 0), { ratio: 0.3 }).join(
      ' | ',
    )
    expect(text).toContain('목적지 주변 주차 포화 45%')
    expect(text).toContain('여유')
    expect(text).not.toContain('주차 후 대중교통 추천')
    expect(text).not.toContain('혼잡 가산')
  })

  it('첫 도착지 주변도 포화(80% 이상)면 추천하지 않는다고 알린다', () => {
    const text = parkingPressureReasons(dest(0.9, 0), { ratio: 0.85 }).join(
      ' | ',
    )
    expect(text).toContain('첫 도착지 주변 주차도 포화 85%')
    expect(text).toContain('추천하지 않음')
    expect(text).not.toContain('주차 후 대중교통 추천')
  })

  it('첫 도착지 주변 정보가 없으면 그 사실을 알리고 추천은 유지한다', () => {
    const text = parkingPressureReasons(dest(0.9, 0), null).join(' | ')
    expect(text).toContain('첫 도착지 주변 주차 정보 없음')
    expect(text).toContain('주차 후 대중교통 추천')
  })
})
