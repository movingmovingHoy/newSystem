import { describe, expect, it } from 'vitest'
import { mergeParkingSnapshots } from './merge'
import type { ParkingSnapshot } from './snapshot'
const snapshot = (
  id: string,
  name: string,
  lat = 37.57,
  fee: ParkingSnapshot['operations'][number]['fee'] = null,
): ParkingSnapshot => ({
  facilities: [
    { id, name, region: '서울특별시', location: { lat, lng: 126.98 } },
  ],
  operations: [{ id, fee }],
})
const fee = { baseFee: 1000, baseTimeMin: 30, addFee: 500, addTimeMin: 10 }
describe('주차장 출처 통합', () => {
  it('이름·좌표가 일치하는 시설은 한 번만 표시하고 서울시 유효요금을 우선한다', () => {
    const r = mergeParkingSnapshots(
      snapshot('seoul:1', '종묘 공영주차장(시)', 37.57, fee),
      snapshot('ts:1', '종묘주차장', 37.5701, { ...fee, baseFee: 2000 }),
    )
    expect(r.snapshot.facilities).toHaveLength(1)
    expect(r.snapshot.operations[0].fee).toEqual(fee)
    expect(r.mergedCount).toBe(1)
  })
  it('서울시 요금이 없을 때 확실히 일치하는 공단 요금만 보완한다', () => {
    const r = mergeParkingSnapshots(
      snapshot('seoul:1', '종묘'),
      snapshot('ts:1', '종묘', 37.57, fee),
    )
    expect(r.snapshot.operations[0].fee).toEqual(fee)
  })
  it('가까워도 이름이 다르거나 같은 이름이라도 멀면 별개로 유지한다', () => {
    expect(
      mergeParkingSnapshots(
        snapshot('seoul:1', '종묘'),
        snapshot('ts:1', '종로'),
      ).snapshot.facilities,
    ).toHaveLength(2)
    expect(
      mergeParkingSnapshots(
        snapshot('seoul:1', '종묘'),
        snapshot('ts:1', '종묘', 37.6),
      ).snapshot.facilities,
    ).toHaveLength(2)
  })
  it('여러 시설이 대응되면 추측해서 합치지 않는다', () => {
    const seoul = snapshot('seoul:1', '종묘')
    seoul.facilities.push({ ...seoul.facilities[0], id: 'seoul:2' })
    seoul.operations.push({ id: 'seoul:2', fee: null })
    expect(
      mergeParkingSnapshots(seoul, snapshot('ts:1', '종묘')).snapshot
        .facilities,
    ).toHaveLength(3)
  })
})
