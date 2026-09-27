import { describe, expect, it } from 'vitest'
import { calculateParkingFee } from './fee'

const fee = { baseFee: 1000, baseTimeMin: 30, addFee: 500, addTimeMin: 10 }

describe('calculateParkingFee', () => {
  it.each([
    [0, 0],
    [20, 1000],
    [30, 1000],
    [31, 1500],
    [60, 2500],
  ])('%s분의 기본/추가 요금은 %s원', (minutes, expected) => {
    expect(calculateParkingFee(fee, minutes)).toBe(expected)
  })
  it('요금 없음과 무료를 구분한다', () => {
    expect(calculateParkingFee(null, 60)).toBeNull()
    expect(calculateParkingFee(null, 0)).toBeNull()
    expect(calculateParkingFee({ ...fee, baseFee: 0, addFee: 0 }, 60)).toBe(0)
  })
  it('일 최대 요금을 적용한다', () => {
    expect(calculateParkingFee({ ...fee, dailyMaxFee: 2000 }, 90)).toBe(2000)
  })
  it('24시간 단위로 일 최대요금을 적용한다', () => {
    expect(calculateParkingFee({ ...fee, dailyMaxFee: 2000 }, 1500)).toBe(4000)
    expect(calculateParkingFee({ ...fee, dailyMaxFee: 2000 }, 1440)).toBe(2000)
  })
  it.each([-1, NaN, Infinity])('잘못된 체류시간 %s를 거절한다', (minutes) => {
    expect(() => calculateParkingFee(fee, minutes)).toThrow(RangeError)
  })
  it('잘못된 요금 단위를 거절한다', () => {
    expect(() => calculateParkingFee({ ...fee, addTimeMin: 0 }, 60)).toThrow(
      RangeError,
    )
  })
})
