import { describe, it, expect } from 'vitest'
import { sumCongestedDriveMin } from './totals'
import type { Leg } from '@shared/types'

const p = { lat: 37.5, lng: 127.0 }

const leg = (extra: Partial<Leg>): Leg => ({
  mode: 'car',
  from: p,
  to: p,
  departAt: '',
  arriveAt: '',
  durationSec: 600,
  cost: 0,
  walkDistanceM: 0,
  transfers: 0,
  fatigue: 0,
  ...extra,
})

describe('sumCongestedDriveMin', () => {
  it('구간별 정체 시간(초)을 합해 분으로 돌려준다', () => {
    const legs = [
      leg({ congestedDriveSec: 600 }),
      leg({ congestedDriveSec: 300 }),
    ]
    expect(sumCongestedDriveMin(legs)).toBe(15)
  })

  it('정체 필드가 없는 구간(대중교통·도보 등)은 0으로 취급한다', () => {
    const legs = [
      leg({ congestedDriveSec: 120 }),
      leg({ mode: 'subway' }),
      leg({ mode: 'walk', congestedDriveSec: undefined }),
    ]
    expect(sumCongestedDriveMin(legs)).toBe(2)
  })

  it('구간이 없으면 0이다', () => {
    expect(sumCongestedDriveMin([])).toBe(0)
  })
})
