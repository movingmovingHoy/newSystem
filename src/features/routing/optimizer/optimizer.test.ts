import { describe, it, expect } from 'vitest'
import { optimizeOrder } from './optimizer'
import type { OptimizeInput } from './optimizer'

/**
 * optimizer: 출발지·도착지 고정, 경유지 최대 3개를 브루트포스 순열로 배치해
 * 총 이동시간이 짧은 순서를 순위와 함께 반환한다. (AGENTS.md 9장)
 *
 * 구간 소요시간은 주입받는 legDurationSec(fromId, toId) 함수로 얻는다.
 * (실제 카카오 API든 mock이든 optimizer는 몰라도 된다)
 * 출발지 id는 'START', 도착지 id는 'END' 로 표현한다.
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
  it('유동 경유지 2개면 2!=2가지 순열을 비교해 최단을 1위로 둔다', () => {
    // A 먼저 가는 게 유리하도록 거리표 구성
    const legDurationSec = tableDuration({
      'START->A': 60,
      'A->B': 60,
      'B->END': 60, // START,A,B,END = 180
      'START->B': 600,
      'B->A': 60,
      'A->END': 60, // START,B,A,END = 720
    })
    const input: OptimizeInput = {
      waypoints: [{ id: 'A' }, { id: 'B' }],
      legDurationSec,
    }
    const result = optimizeOrder(input)
    expect(result.orderings).toHaveLength(2)
    expect(result.orderings[0].order).toEqual(['A', 'B'])
    expect(result.orderings[0].totalSec).toBe(180)
    expect(result.orderings[1].order).toEqual(['B', 'A'])
    expect(result.orderings[1].totalSec).toBe(720)
    // best 는 1위와 동일
    expect(result.best.order).toEqual(['A', 'B'])
  })

  it('유동 경유지 3개면 3!=6가지를 비교한다', () => {
    // 모든 구간 동일 시간 → 6개 순열 모두 같은 총합, 개수만 확인
    const legDurationSec = () => 100
    const result = optimizeOrder({
      waypoints: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      legDurationSec,
    })
    expect(result.orderings).toHaveLength(6)
    // 경유지 3개 → 구간 4개 → 400
    expect(result.orderings[0].totalSec).toBe(400)
  })

  it('경유지가 없으면 순열은 1가지(빈 순서)뿐이다', () => {
    const result = optimizeOrder({
      waypoints: [],
      legDurationSec: tableDuration({ 'START->END': 300 }),
    })
    expect(result.orderings).toHaveLength(1)
    expect(result.orderings[0].order).toEqual([])
    expect(result.orderings[0].totalSec).toBe(300)
    expect(result.best.order).toEqual([])
  })

  it('fixedIndex가 있는 경유지는 그 순번에 고정되고 유동만 순열된다', () => {
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

  it('경유지가 4개 이상이면 에러를 던진다 (MAX_WAYPOINTS=3)', () => {
    expect(() =>
      optimizeOrder({
        waypoints: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
        legDurationSec: () => 100,
      }),
    ).toThrow()
  })
})
