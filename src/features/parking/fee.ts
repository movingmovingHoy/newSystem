import type { FeeInfo } from '@shared/types'

/**
 * 체류시간 기준 예상 요금. null은 무료가 아니라 요금 정보 없음이다.
 * 현재 FeeInfo에는 달력일/야간 정책이 없어 일 상한은 입차 후 24시간 단위로 추정한다.
 */
export function calculateParkingFee(
  fee: FeeInfo | null,
  dwellMin: number,
): number | null {
  if (!Number.isFinite(dwellMin) || dwellMin < 0) {
    throw new RangeError('체류시간은 0 이상의 유한한 분이어야 합니다.')
  }
  if (fee === null) return null
  const amounts = [fee.baseFee, fee.baseTimeMin, fee.addFee, fee.addTimeMin]
  if (fee.dailyMaxFee !== undefined) amounts.push(fee.dailyMaxFee)
  if (
    amounts.some((value) => !Number.isFinite(value) || value < 0) ||
    fee.addTimeMin === 0
  ) {
    throw new RangeError(
      '주차 요금은 0 이상, 추가 요금 단위 시간은 양수여야 합니다.',
    )
  }
  const charge = (minutes: number) =>
    minutes === 0
      ? 0
      : fee.baseFee +
        Math.ceil(Math.max(0, minutes - fee.baseTimeMin) / fee.addTimeMin) *
          fee.addFee
  if (fee.dailyMaxFee === undefined) return charge(dwellMin)
  const minutesPerDay = 24 * 60
  const fullDays = Math.floor(dwellMin / minutesPerDay)
  return (
    fullDays * Math.min(charge(minutesPerDay), fee.dailyMaxFee) +
    Math.min(charge(dwellMin % minutesPerDay), fee.dailyMaxFee)
  )
}
