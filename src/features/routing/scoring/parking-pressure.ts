import {
  PARKING_FULL_RATIO,
  PARKING_PRESSURE_CONGESTION_MAX,
  PARKING_PRESSURE_MAX_LEVEL,
  PARKING_PRESSURE_THRESHOLD,
} from '@shared/config'

/**
 * 목적지 주차 압박. AGENTS.md 8-2.
 * 압박점수 = 포화율(0~100) + 혼잡도 가산(0~PARKING_PRESSURE_CONGESTION_MAX).
 * 임계값(PARKING_PRESSURE_THRESHOLD) 이상이면 "주차 후 대중교통"을 추천 근거로 든다.
 * 경로 순위(종합 부담도)에는 쓰지 않고 근거 문구에만 쓴다.
 */

export type ParkingPressureInput = {
  /** 목적지 인근 포화율 0~1 */
  occupancyRatio: number
  /** 목적지 도착 시각의 혼잡 단계 0~3. null = 정보 없음(가산 0) */
  congestionLevel: number | null
}

export type ParkingPressureResult = {
  /** 압박점수 (소수 둘째 자리까지) */
  score: number
  occupancyRatio: number
  /** 혼잡도 가산 0~PARKING_PRESSURE_CONGESTION_MAX */
  congestionBonus: number
  recommended: boolean
}

/** 혼잡 단계(0~최대 단계)를 0~가산 최대점으로 선형 환산한다. null 이면 0. */
export function congestionBonus(level: number | null): number {
  if (level === null || !Number.isFinite(level)) return 0
  const clamped = Math.min(PARKING_PRESSURE_MAX_LEVEL, Math.max(0, level))
  return (
    (clamped / PARKING_PRESSURE_MAX_LEVEL) * PARKING_PRESSURE_CONGESTION_MAX
  )
}

export function evaluateParkingPressure(
  input: ParkingPressureInput,
): ParkingPressureResult {
  const bonus = congestionBonus(input.congestionLevel)
  // 부동소수점 오차로 경계값(예: 80)이 어긋나지 않도록 소수 둘째 자리로 맞춘다.
  const score = Math.round((input.occupancyRatio * 100 + bonus) * 100) / 100
  return {
    score,
    occupancyRatio: input.occupancyRatio,
    congestionBonus: bonus,
    recommended: score >= PARKING_PRESSURE_THRESHOLD,
  }
}

/**
 * 추천 근거 문구. first 는 첫 도착지(차를 세울 곳) 인근 포화율이고, 정보가 없으면 null.
 * 첫 도착지 인근이 이미 포화(PARKING_FULL_RATIO 이상)면 추천하지 않는다고 알린다.
 */
export function parkingPressureReasons(
  dest: ParkingPressureResult,
  first: { ratio: number } | null,
): string[] {
  const pct = Math.round(dest.occupancyRatio * 100)
  const score = Math.round(dest.score)
  const firstPct = first ? Math.round(first.ratio * 100) : 0
  const firstFull = first !== null && first.ratio >= PARKING_FULL_RATIO
  const reasons: string[] = []

  // 화면에는 구성(포화율 + 혼잡 가산)을 드러내지 않고 "주차 혼잡 점수" 하나로만 보여준다.
  if (!dest.recommended) {
    reasons.push(
      `목적지 주변 주차 포화 ${pct}%로 여유 있음 (주차 혼잡 점수 ${score}점)`,
    )
  } else if (firstFull) {
    reasons.push(
      `목적지 주변 주차 포화 ${pct}%이지만 첫 도착지 주변 주차도 포화 ${firstPct}%라 추천하지 않음`,
    )
  } else {
    reasons.push(
      `목적지 주변 주차 포화 ${pct}% (주차 혼잡 점수 ${score}점) → 주차 후 대중교통 추천`,
    )
  }
  if (first === null) reasons.push('첫 도착지 주변 주차 정보 없음')
  return reasons
}
