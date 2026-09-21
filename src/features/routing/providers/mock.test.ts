import { describe, it, expect } from 'vitest'
import { MockCarProvider, MockTransitProvider } from './index'

const seoulStation = { lat: 37.5547, lng: 126.9707 }
const gangnam = { lat: 37.4979, lng: 127.0276 }

describe('routing mock providers', () => {
  it('자차 provider는 하나의 car leg을 도착 시각과 함께 반환한다', async () => {
    const legs = await new MockCarProvider().route({
      from: seoulStation,
      to: gangnam,
      departAt: '2026-09-21T09:00:00.000Z',
    })
    expect(legs).toHaveLength(1)
    expect(legs[0].mode).toBe('car')
    expect(legs[0].durationSec).toBeGreaterThan(0)
    expect(new Date(legs[0].arriveAt).getTime()).toBeGreaterThan(
      new Date(legs[0].departAt).getTime(),
    )
  })

  it('대중교통 provider는 교통비와 환승 정보를 담는다', async () => {
    const legs = await new MockTransitProvider().route({
      from: seoulStation,
      to: gangnam,
    })
    expect(legs[0].cost).toBeGreaterThan(0)
    expect(legs[0].transfers).toBeGreaterThanOrEqual(1)
  })
})
