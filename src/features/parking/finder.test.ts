import { describe, expect, it, vi } from 'vitest'
import type { ParkingLot } from '@shared/types'
import { findParkingCandidates } from './finder'

const center = { lat: 37.5, lng: 127 }
function lot(id: string, distance: number, price: number | null): ParkingLot {
  return {
    id,
    name: id,
    location: center,
    distanceToWaypointM: distance,
    fee:
      price === null
        ? null
        : { baseFee: price, baseTimeMin: 60, addFee: price, addTimeMin: 60 },
  }
}
function provider(lots: ParkingLot[]) {
  return { search: vi.fn().mockResolvedValue(lots), getAvailability: vi.fn() }
}

describe('findParkingCandidates', () => {
  it('1km 반경을 요청하고 경계 포함, 범위 밖 제외한다', async () => {
    const source = provider([lot('edge', 1000, 100), lot('out', 1001, 0)])
    expect(
      (await findParkingCandidates(source, center, 60)).map((l) => l.id),
    ).toEqual(['edge'])
    expect(source.search).toHaveBeenCalledWith({ center, radiusM: 1000 })
  })
  it('가까운 곳, 최저요금, 균형 후보를 최대 세 곳 선정한다', async () => {
    const source = provider([
      lot('near', 100, 10000),
      lot('cheap', 900, 1000),
      lot('balance', 300, 3000),
      lot('bad', 800, 9000),
    ])
    expect(
      (await findParkingCandidates(source, center, 60)).map((l) => l.id),
    ).toEqual(['near', 'cheap', 'balance'])
  })
  it('요금 없는 주차장을 유지하고 무료와 구분한다', async () => {
    const result = await findParkingCandidates(
      provider([lot('unknown', 100, null), lot('free', 200, 0)]),
      center,
      60,
    )
    expect(result.map((l) => l.id)).toEqual(['unknown', 'free'])
    expect(result[0].fee).toBeNull()
  })
  it('전부 요금이 없으면 가까운 순으로 채운다', async () => {
    const source = provider([
      lot('d', 400, null),
      lot('b', 200, null),
      lot('a', 100, null),
      lot('c', 300, null),
    ])
    expect(
      (await findParkingCandidates(source, center, 60)).map((l) => l.id),
    ).toEqual(['a', 'b', 'c'])
  })
  it('같은 주차장 ID를 중복 선정하지 않는다', async () => {
    const a = lot('a', 100, 0)
    expect(
      (
        await findParkingCandidates(
          provider([a, a, lot('b', 200, 100), lot('c', 300, 200)]),
          center,
          60,
        )
      ).map((l) => l.id),
    ).toEqual(['a', 'b', 'c'])
  })
  it('체류시간의 총요금으로 최저요금을 비교한다', async () => {
    const fast = lot('fast', 300, 100)
    fast.fee = { baseFee: 100, baseTimeMin: 10, addFee: 1000, addTimeMin: 10 }
    const source = provider([
      lot('near', 100, null),
      fast,
      lot('flat', 400, 500),
    ])
    expect((await findParkingCandidates(source, center, 60))[1].id).toBe('flat')
  })
  it('후보가 없으면 빈 배열을 반환한다', async () => {
    expect(await findParkingCandidates(provider([]), center, 60)).toEqual([])
  })
  it('입력 배열을 수정하지 않는다', async () => {
    const lots = [lot('b', 200, 100), lot('a', 100, null)]
    await findParkingCandidates(provider(lots), center, 60)
    expect(lots.map((l) => l.id)).toEqual(['b', 'a'])
  })
})
