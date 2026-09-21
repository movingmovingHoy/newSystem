import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CongestionService } from './congestion'
import type { CongestionProvider } from './providers'

/**
 * CongestionService: 좌표 + 도착시각 → PlaceCongestion { level, areaCode? }
 * - 좌표가 121곳 밖이면 provider 호출 없이 level=null
 * - 안이면 provider(XML) 조회 → 도착시각 예측 level
 * - 같은 areaCode 는 30분 캐시 (재호출 없음)
 */

// POI001(강남 MICE) 내부로 확인된 좌표
const insidePOI001 = { lat: 37.510897, lng: 127.059949 }
// 서울 밖 (부산)
const outside = { lat: 35.1587, lng: 129.1604 }

function makeSpyProvider(): CongestionProvider & { calls: number } {
  const p = {
    calls: 0,
    async fetchRaw(areaCode: string): Promise<string> {
      p.calls += 1
      // 도착시각 근처(현재+1h)에 "붐빔" 예측을 주는 XML
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
      const t1 = new Date(now.getTime() + 60 * 60 * 1000)
      return `<Map><SeoulRtd.citydata_ppltn><AREA_CD>${areaCode}</AREA_CD><AREA_CONGEST_LVL>보통</AREA_CONGEST_LVL><PPLTN_TIME>${fmt(now)}</PPLTN_TIME><FCST_PPLTN><FCST_PPLTN><FCST_TIME>${fmt(t1)}</FCST_TIME><FCST_CONGEST_LVL>붐빔</FCST_CONGEST_LVL></FCST_PPLTN></FCST_PPLTN></SeoulRtd.citydata_ppltn></Map>`
    },
  }
  return p
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-21T12:00:00+09:00'))
})
afterEach(() => vi.useRealTimers())

describe('CongestionService', () => {
  it('121곳 밖이면 level=null이고 provider를 부르지 않는다', async () => {
    const provider = makeSpyProvider()
    const svc = new CongestionService(provider)
    const arriveAt = new Date('2026-09-21T13:00:00+09:00')

    const result = await svc.getCongestion(outside, arriveAt)
    expect(result.level).toBeNull()
    expect(result.areaCode).toBeUndefined()
    expect(provider.calls).toBe(0)
  })

  it('121곳 안이면 areaCode를 매칭하고 도착시각 예측 level을 반환한다', async () => {
    const provider = makeSpyProvider()
    const svc = new CongestionService(provider)
    // 현재 12:00, 도착 13:00 → 예측(13:00) 붐빔=3
    const arriveAt = new Date('2026-09-21T13:00:00+09:00')

    const result = await svc.getCongestion(insidePOI001, arriveAt)
    expect(result.areaCode).toBe('POI001')
    expect(result.level).toBe(3)
    expect(provider.calls).toBe(1)
  })

  it('같은 areaCode를 30분 안에 다시 조회하면 provider를 재호출하지 않는다', async () => {
    const provider = makeSpyProvider()
    const svc = new CongestionService(provider)
    const arriveAt = new Date('2026-09-21T13:00:00+09:00')

    await svc.getCongestion(insidePOI001, arriveAt)
    await svc.getCongestion(insidePOI001, arriveAt)
    expect(provider.calls).toBe(1)
  })

  it('30분이 지나면 provider를 다시 호출한다', async () => {
    const provider = makeSpyProvider()
    const svc = new CongestionService(provider)
    const arriveAt = new Date('2026-09-21T13:00:00+09:00')

    await svc.getCongestion(insidePOI001, arriveAt)
    vi.setSystemTime(new Date('2026-09-21T12:31:00+09:00'))
    await svc.getCongestion(insidePOI001, arriveAt)
    expect(provider.calls).toBe(2)
  })
})
