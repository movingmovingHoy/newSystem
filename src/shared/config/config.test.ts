import { describe, it, expect } from 'vitest'
import {
  MAX_WAYPOINTS,
  MAX_PARKING_CANDIDATES,
  PARKING_RADIUS_M,
  SCENARIO_SENSITIVITY,
  LEVEL_PENALTY,
} from './index'

describe('shared/config 기본값 (AGENTS.md 5, 12장)', () => {
  it('상수 기본값이 스펙과 일치한다', () => {
    expect(MAX_WAYPOINTS).toBe(3)
    expect(MAX_PARKING_CANDIDATES).toBe(3)
    expect(PARKING_RADIUS_M).toBe(1000)
  })

  it('시나리오 민감도는 car-direct > park-transit > transit-only', () => {
    expect(SCENARIO_SENSITIVITY['car-direct']).toBeGreaterThan(
      SCENARIO_SENSITIVITY['park-transit'],
    )
    expect(SCENARIO_SENSITIVITY['park-transit']).toBeGreaterThan(
      SCENARIO_SENSITIVITY['transit-only'],
    )
  })

  it('mixed 시나리오는 더 이상 없다', () => {
    expect(Object.keys(SCENARIO_SENSITIVITY).sort()).toEqual([
      'car-direct',
      'park-transit',
      'transit-only',
    ])
  })

  it('여유/보통 단계는 감점 0', () => {
    expect(LEVEL_PENALTY[0]).toBe(0)
    expect(LEVEL_PENALTY[1]).toBe(0)
  })
})
