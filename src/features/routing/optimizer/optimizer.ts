import { MAX_WAYPOINTS } from '@shared/config'

/**
 * 경유지 순서 최적화. AGENTS.md 9장.
 * 출발지(START)·도착지(END)는 고정. 경유지 최대 3개 → 최악 3!=6가지 브루트포스.
 * fixedIndex가 있는 경유지는 그 순번에 고정, 유동 경유지만 순열로 배치한다.
 * 구간 소요시간은 주입받는 legDurationSec 함수로 얻는다 (직선거리 근사 금지).
 */

export const START_ID = 'START'
export const END_ID = 'END'

export type OptimizerWaypoint = {
  id: string
  /** 순번 고정 (0-based). 없으면 유동 */
  fixedIndex?: number
}

export type OptimizeInput = {
  waypoints: OptimizerWaypoint[]
  /** 구간 소요시간(초). from/to 는 경유지 id 또는 START_ID/END_ID */
  legDurationSec: (fromId: string, toId: string) => number
}

export type Ordering = {
  /** 경유지 id 를 방문 순서대로 나열 */
  order: string[]
  /** 총 이동시간(초). START→...→END 구간 합 */
  totalSec: number
}

export type OptimizeResult = {
  /** 총 이동시간 오름차순 정렬 */
  orderings: Ordering[]
  /** 1위 순서 (기본 순서) */
  best: Ordering
}

/** 배열의 모든 순열을 생성 */
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()]
  const result: T[][] = []
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const perm of permutations(rest)) {
      result.push([items[i], ...perm])
    }
  }
  return result
}

function validate(waypoints: OptimizerWaypoint[]): void {
  if (waypoints.length > MAX_WAYPOINTS) {
    throw new Error(
      `경유지는 최대 ${MAX_WAYPOINTS}개까지입니다 (요청: ${waypoints.length}개)`,
    )
  }
  const fixed = waypoints
    .map((w) => w.fixedIndex)
    .filter((idx): idx is number => idx !== undefined)
  const unique = new Set(fixed)
  if (unique.size !== fixed.length) {
    throw new Error('fixedIndex가 중복되었습니다')
  }
  for (const idx of fixed) {
    if (idx < 0 || idx >= waypoints.length) {
      throw new Error(
        `fixedIndex(${idx})가 경유지 범위(0~${waypoints.length - 1})를 벗어났습니다`,
      )
    }
  }
}

/**
 * fixedIndex를 존중하며 가능한 방문 순서(경유지 id 배열)를 모두 생성한다.
 * 고정된 경유지는 지정 순번에 놓고, 유동 경유지는 남은 자리에 순열로 채운다.
 */
function buildCandidateOrders(waypoints: OptimizerWaypoint[]): string[][] {
  const n = waypoints.length
  const fixedSlots = new Map<number, string>()
  const floating: string[] = []
  for (const w of waypoints) {
    if (w.fixedIndex !== undefined) fixedSlots.set(w.fixedIndex, w.id)
    else floating.push(w.id)
  }

  const freeSlots: number[] = []
  for (let i = 0; i < n; i++) {
    if (!fixedSlots.has(i)) freeSlots.push(i)
  }

  const orders: string[][] = []
  for (const perm of permutations(floating)) {
    const slot = new Array<string>(n)
    for (const [idx, id] of fixedSlots) slot[idx] = id
    perm.forEach((id, i) => {
      slot[freeSlots[i]] = id
    })
    orders.push(slot)
  }
  return orders
}

function totalDuration(
  order: string[],
  legDurationSec: (from: string, to: string) => number,
): number {
  const path = [START_ID, ...order, END_ID]
  let sum = 0
  for (let i = 0; i < path.length - 1; i++) {
    sum += legDurationSec(path[i], path[i + 1])
  }
  return sum
}

export function optimizeOrder(input: OptimizeInput): OptimizeResult {
  const { waypoints, legDurationSec } = input
  validate(waypoints)

  const candidates = buildCandidateOrders(waypoints)
  const orderings: Ordering[] = candidates
    .map((order) => ({ order, totalSec: totalDuration(order, legDurationSec) }))
    .sort((a, b) => a.totalSec - b.totalSec)

  return { orderings, best: orderings[0] }
}
