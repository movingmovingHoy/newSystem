import type { Route } from '@shared/types'

/**
 * 경로 정렬 기준. AGENTS.md 12장의 종합점수(추천순)는 유지하되,
 * 사용자가 다른 관점으로도 볼 수 있게 정렬 기준을 여러 개 제공한다.
 * 정렬만 바꾸는 것이며 점수 계산 자체는 건드리지 않는다.
 */
export type RankCriterion = 'recommended' | 'fastest' | 'cheapest' | 'leastWalk'

export const RANK_LABELS: Record<RankCriterion, string> = {
  recommended: '추천순',
  fastest: '시간 빠른순',
  cheapest: '비용 싼순',
  leastWalk: '도보 적은순',
}

/** 각 기준의 정렬 키 (모두 "작을수록 앞" = 오름차순) */
function sortKey(route: Route, criterion: RankCriterion): number {
  switch (criterion) {
    case 'recommended':
      return route.score // 낮을수록 좋음
    case 'fastest':
      return route.totals.durationSec
    case 'cheapest':
      return route.totals.cost
    case 'leastWalk':
      return route.totals.walkDistanceM
  }
}

/**
 * 기준에 따라 정렬된 새 배열을 반환한다 (원본 불변).
 * 동점이면 추천 점수(score)로 2차 정렬해 안정적인 순서를 만든다.
 */
export function rankRoutes(routes: Route[], criterion: RankCriterion): Route[] {
  return [...routes].sort((a, b) => {
    const diff = sortKey(a, criterion) - sortKey(b, criterion)
    if (diff !== 0) return diff
    return a.score - b.score
  })
}
