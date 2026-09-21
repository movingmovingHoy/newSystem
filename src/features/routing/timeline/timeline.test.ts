import { describe, it, expect } from 'vitest'
import { buildTimeline } from './timeline'

/**
 * timeline: 출발 시각 + 구간 이동시간 + 경유지 체류시간을 누적해
 * 경유지별 도착/출발 시각과 최종 도착 시각을 만든다. (AGENTS.md 7장 5단계)
 *
 * 구간 수 = 경유지 수 + 1
 *  - leg[0]: 출발지 → 경유지1
 *  - leg[i]: 경유지i → 경유지i+1
 *  - leg[마지막]: 마지막 경유지 → 도착지
 */
describe('buildTimeline', () => {
  it('경유지 없이 출발→도착만 있으면 최종 도착 시각만 계산한다', () => {
    const result = buildTimeline({
      departAt: '2026-09-21T09:00:00.000Z',
      legDurationsSec: [30 * 60], // 30분
      dwellMinutes: [],
    })
    expect(result.stops).toEqual([])
    expect(result.finalArriveAt).toBe('2026-09-21T09:30:00.000Z')
  })

  it('경유지 1개: 도착→체류→출발→최종도착을 누적한다', () => {
    const result = buildTimeline({
      departAt: '2026-09-21T09:00:00.000Z',
      legDurationsSec: [20 * 60, 40 * 60], // 출발→경유지 20분, 경유지→도착 40분
      dwellMinutes: [60], // 경유지 체류 60분
    })
    expect(result.stops).toHaveLength(1)
    expect(result.stops[0].arriveAt).toBe('2026-09-21T09:20:00.000Z')
    expect(result.stops[0].departAt).toBe('2026-09-21T10:20:00.000Z')
    // 10:20 + 40분 = 11:00
    expect(result.finalArriveAt).toBe('2026-09-21T11:00:00.000Z')
  })

  it('경유지 여러 개의 도착/출발 시각을 순서대로 누적한다', () => {
    const result = buildTimeline({
      departAt: '2026-09-21T08:00:00.000Z',
      legDurationsSec: [10 * 60, 15 * 60, 20 * 60], // 3구간 → 경유지 2개
      dwellMinutes: [30, 45],
    })
    expect(result.stops).toHaveLength(2)
    // 경유지1: 8:00 +10분 도착 = 8:10, +30분 체류 출발 = 8:40
    expect(result.stops[0].arriveAt).toBe('2026-09-21T08:10:00.000Z')
    expect(result.stops[0].departAt).toBe('2026-09-21T08:40:00.000Z')
    // 경유지2: 8:40 +15분 도착 = 8:55, +45분 체류 출발 = 9:40
    expect(result.stops[1].arriveAt).toBe('2026-09-21T08:55:00.000Z')
    expect(result.stops[1].departAt).toBe('2026-09-21T09:40:00.000Z')
    // 최종: 9:40 +20분 = 10:00
    expect(result.finalArriveAt).toBe('2026-09-21T10:00:00.000Z')
  })

  it('체류시간을 바꾸면 이후 시각에 그대로 반영된다', () => {
    const base = {
      departAt: '2026-09-21T09:00:00.000Z',
      legDurationsSec: [10 * 60, 10 * 60],
    }
    const short = buildTimeline({ ...base, dwellMinutes: [30] })
    const long = buildTimeline({ ...base, dwellMinutes: [90] })
    // 체류 60분 차이가 최종 도착 시각에 그대로 반영
    const diffMs =
      new Date(long.finalArriveAt).getTime() -
      new Date(short.finalArriveAt).getTime()
    expect(diffMs).toBe(60 * 60 * 1000)
  })

  it('자정을 넘기면 다음 날 시각으로 계산한다', () => {
    const result = buildTimeline({
      departAt: '2026-09-21T23:30:00.000Z',
      legDurationsSec: [20 * 60, 30 * 60], // 20분, 30분
      dwellMinutes: [40], // 40분 체류
    })
    // 23:30 +20분 도착 = 23:50, +40분 체류 출발 = 다음날 00:30
    expect(result.stops[0].arriveAt).toBe('2026-09-21T23:50:00.000Z')
    expect(result.stops[0].departAt).toBe('2026-09-22T00:30:00.000Z')
    // 00:30 +30분 = 01:00 (다음날)
    expect(result.finalArriveAt).toBe('2026-09-22T01:00:00.000Z')
  })

  it('구간 수가 경유지 수 + 1이 아니면 에러를 던진다', () => {
    expect(() =>
      buildTimeline({
        departAt: '2026-09-21T09:00:00.000Z',
        legDurationsSec: [10 * 60], // 1구간인데
        dwellMinutes: [30], // 경유지 1개 → 2구간이어야 함
      }),
    ).toThrow()
  })
})
