import { describe, it, expect } from 'vitest'
import { optimizeOrder } from './optimizer'
import type { OptimizeInput } from './optimizer'

/**
 * optimizer: 출발지(START)만 고정. 도착지 최대 3개를 브루트포스 순열로 배치해
 * 총 이동시간이 짧은 순서를 순위와 함께 반환한다. (AGENTS.md 9장)
 * "최종 도착지" 고정 개념이 없어 순서상 마지막 도착지가 종점이 된다.
 *
 * 구간 소요시간은 주입받는 legDurationSec(fromId, toId) 함수로 얻는다.
 * 출발지 id는 'START', 나머지는 도착지 id.
 */

/** 좌표 없이 id만으로 거리표를 만드는 테스트용 헬퍼 */
function tableDuration(
  table: Record<string, number>,
): (from: string, to: string) => number {
  return (from, to) => {
    const key = `${from}->${to}`
    if (!(key in table)) throw new Error(`거리표에 없는 구간: ${key}`)
    return table[key]
  }
}

describe('optimizeOrder', () => {
  it('유동 도착지 2개면 2!=2가지 순열을 비교해 최단을 1위로 둔다', () => {
    // A 먼저 가는 게 유리하도록 거리표 구성. 종점 고정이 없으므로
    // 경로는 START→A→B (마지막 도착지가 종점).
    const legDurationSec = tableDuration({
      'START->A': 60,
      'A->B': 60, // START,A,B = 120
      'START->B': 600,
      'B->A': 60, // START,B,A = 660
    })
    const input: OptimizeInput = {
      waypoints: [{ id: 'A' }, { id: 'B' }],
      legDurationSec,
    }
    const result = optimizeOrder(input)
    expect(result.orderings).toHaveLength(2)
    expect(result.orderings[0].order).toEqual(['A', 'B'])
    expect(result.orderings[0].totalSec).toBe(120)
    expect(result.orderings[1].order).toEqual(['B', 'A'])
    expect(result.orderings[1].totalSec).toBe(660)
    // best 는 1위와 동일
    expect(result.best.order).toEqual(['A', 'B'])
  })

  it('유동 도착지 3개면 3!=6가지를 비교한다', () => {
    // 모든 구간 동일 시간 → 6개 순열 모두 같은 총합, 개수만 확인
    const legDurationSec = () => 100
    const result = optimizeOrder({
      waypoints: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      legDurationSec,
    })
    expect(result.orderings).toHaveLength(6)
    // 도착지 3개 → 구간 3개(START→A→B→C) → 300
    expect(result.orderings[0].totalSec).toBe(300)
  })

  it('도착지가 없으면 순열은 1가지(빈 순서, 이동 0)뿐이다', () => {
    const result = optimizeOrder({
      waypoints: [],
      legDurationSec: () => 0,
    })
    expect(result.orderings).toHaveLength(1)
    expect(result.orderings[0].order).toEqual([])
    expect(result.orderings[0].totalSec).toBe(0)
    expect(result.best.order).toEqual([])
  })

  it('fixedIndex가 있는 도착지는 그 순번에 고정되고 유동만 순열된다', () => {
    // B를 0번에 고정 → 가능한 순서: [B,A,C],[B,C,A] (2가지)
    const legDurationSec = () => 100
    const result = optimizeOrder({
      waypoints: [{ id: 'A' }, { id: 'B', fixedIndex: 0 }, { id: 'C' }],
      legDurationSec,
    })
    expect(result.orderings).toHaveLength(2)
    for (const o of result.orderings) {
      expect(o.order[0]).toBe('B')
    }
  })

  it('전부 고정이면 순열은 1가지(그 순서 그대로)다', () => {
    const legDurationSec = () => 100
    const result = optimizeOrder({
      waypoints: [
        { id: 'A', fixedIndex: 0 },
        { id: 'B', fixedIndex: 1 },
      ],
      legDurationSec,
    })
    expect(result.orderings).toHaveLength(1)
    expect(result.orderings[0].order).toEqual(['A', 'B'])
  })

  it('fixedIndex가 중복되면 에러를 던진다', () => {
    expect(() =>
      optimizeOrder({
        waypoints: [
          { id: 'A', fixedIndex: 0 },
          { id: 'B', fixedIndex: 0 },
        ],
        legDurationSec: () => 100,
      }),
    ).toThrow()
  })

  it('도착지가 4개 이상이면 에러를 던진다 (MAX_WAYPOINTS=3)', () => {
    expect(() =>
      optimizeOrder({
        waypoints: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
        legDurationSec: () => 100,
      }),
    ).toThrow()
  })
})
