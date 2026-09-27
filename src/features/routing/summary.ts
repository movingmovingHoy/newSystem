import type { Route, Scenario } from '@shared/types'

/**
 * 추천 요약. 점수순 1위 경로를 기준으로, 2위와 비교해 사람이 읽을 문장을 만든다.
 * "오늘은 대중교통이 좋습니다. 자차보다 15분 빠르고 2,000원 쌉니다." 식.
 * 입력 routes 는 점수 오름차순(1위가 [0])이라고 가정한다.
 */

const SCENARIO_LABEL: Record<Scenario, string> = {
  'car-direct': '자차',
  mixed: '혼합(주차 후 대중교통·도보)',
  'transit-only': '대중교통',
}

export type RouteSummary = {
  /** 한 줄 추천 문구 */
  headline: string
  /** 1위가 2위보다 나은 점들 (분/원/도보) */
  details: string[]
}

function minutes(sec: number): number {
  return Math.round(sec / 60)
}

export function summarizeRoutes(routes: Route[]): RouteSummary {
  if (routes.length === 0) {
    return { headline: '추천할 경로가 없습니다.', details: [] }
  }

  const best = routes[0]
  const bestLabel = SCENARIO_LABEL[best.scenario]

  if (routes.length === 1) {
    return {
      headline: `${bestLabel} 경로를 추천합니다.`,
      details: [
        `총 ${minutes(best.totals.durationSec)}분, ${best.totals.cost.toLocaleString()}원`,
      ],
    }
  }

  const second = routes[1]
  const secondLabel = SCENARIO_LABEL[second.scenario]
  const details: string[] = []

  const timeDiff = minutes(second.totals.durationSec - best.totals.durationSec)
  if (timeDiff > 0) {
    details.push(`${secondLabel}보다 ${timeDiff}분 빠릅니다`)
  } else if (timeDiff < 0) {
    details.push(
      `${secondLabel}보다 ${-timeDiff}분 더 걸리지만 종합 점수가 좋습니다`,
    )
  }

  const costDiff = second.totals.cost - best.totals.cost
  if (costDiff > 0) {
    details.push(`${costDiff.toLocaleString()}원 저렴합니다`)
  } else if (costDiff < 0) {
    details.push(
      `${(-costDiff).toLocaleString()}원 더 들지만 종합적으로 낫습니다`,
    )
  }

  const walkDiff = second.totals.walkDistanceM - best.totals.walkDistanceM
  if (walkDiff >= 100) {
    details.push(`걷는 거리가 ${walkDiff}m 적습니다`)
  }

  return {
    headline: `오늘은 ${bestLabel} 경로가 가장 좋습니다.`,
    details,
  }
}
