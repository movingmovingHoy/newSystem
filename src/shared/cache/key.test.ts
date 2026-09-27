import { describe, it, expect } from 'vitest'
import { buildRouteKey } from './key'

/**
 * 경로 캐시 키. AGENTS.md 14장.
 * route:{mode}:{출발좌표}:{도착좌표}:{시간버킷}
 * 좌표는 소수점 4자리 반올림, 시간은 30분 버킷.
 */

const from = { lat: 37.55467, lng: 126.97065 }
const to = { lat: 37.49795, lng: 127.02761 }

describe('buildRouteKey', () => {
  it('mode와 반올림 좌표(소수점 4자리), 시간 버킷을 담은 키를 만든다', () => {
    const key = buildRouteKey('car', {
      from,
      to,
      departAt: '2026-09-21T09:00:00.000Z',
    })
    expect(key.startsWith('route:car:')).toBe(true)
    // 소수점 4자리로 반올림된 좌표가 들어간다
    expect(key).toContain('37.5547')
    // 좌표는 소수점 4자리 형식 (lat,lng) 이다
    expect(key).toMatch(/\d+\.\d{4},\d+\.\d{4}/)
    // 시간 버킷은 09:00 정각으로 정규화
    expect(key.endsWith('2026-09-21T09:00:00.000Z')).toBe(true)
  })

  it('좌표가 5번째 소수점만 다르면 같은 키가 된다 (반올림 결과 동일)', () => {
    const k1 = buildRouteKey('car', {
      from: { lat: 37.554671, lng: 126.970651 },
      to,
      departAt: '2026-09-21T09:00:00.000Z',
    })
    const k2 = buildRouteKey('car', {
      from: { lat: 37.554669, lng: 126.970652 },
      to,
      departAt: '2026-09-21T09:00:00.000Z',
    })
    expect(k1).toBe(k2)
  })

  it('같은 30분 버킷 안의 서로 다른 시각은 같은 키가 된다', () => {
    const k1 = buildRouteKey('car', {
      from,
      to,
      departAt: '2026-09-21T09:05:00.000Z',
    })
    const k2 = buildRouteKey('car', {
      from,
      to,
      departAt: '2026-09-21T09:29:59.000Z',
    })
    expect(k1).toBe(k2)
  })

  it('다른 30분 버킷은 다른 키가 된다', () => {
    const k1 = buildRouteKey('car', {
      from,
      to,
      departAt: '2026-09-21T09:29:00.000Z',
    })
    const k2 = buildRouteKey('car', {
      from,
      to,
      departAt: '2026-09-21T09:31:00.000Z',
    })
    expect(k1).not.toBe(k2)
  })

  it('mode가 다르면 다른 키가 된다', () => {
    const q = { from, to, departAt: '2026-09-21T09:00:00.000Z' }
    expect(buildRouteKey('car', q)).not.toBe(buildRouteKey('transit', q))
  })

  it('출발/도착이 바뀌면 다른 키가 된다', () => {
    const q = { from, to, departAt: '2026-09-21T09:00:00.000Z' }
    const swapped = { from: to, to: from, departAt: q.departAt }
    expect(buildRouteKey('car', q)).not.toBe(buildRouteKey('car', swapped))
  })
})
