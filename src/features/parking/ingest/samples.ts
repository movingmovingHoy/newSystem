import type { ParkingSnapshot } from './snapshot'

/** UI 개발용 가상 시설. 실제 주차장 위치·요금 데이터가 아니다. */
export const parkingSampleSnapshot: ParkingSnapshot = {
  facilities: [
    {
      id: 'sample-cityhall-unknown',
      name: '[샘플] 시청 인근 A',
      region: '서울특별시',
      location: { lat: 37.5666, lng: 126.978 },
    },
    {
      id: 'sample-cityhall-cheap',
      name: '[샘플] 시청 인근 B',
      region: '서울특별시',
      location: { lat: 37.568, lng: 126.979 },
    },
    {
      id: 'sample-cityhall-balance',
      name: '[샘플] 시청 인근 C',
      region: '서울특별시',
      location: { lat: 37.565, lng: 126.976 },
    },
    {
      id: 'sample-cityhall-far',
      name: '[샘플] 시청 인근 D',
      region: '서울특별시',
      location: { lat: 37.572, lng: 126.982 },
    },
    {
      id: 'sample-gangnam',
      name: '[샘플] 강남역 인근',
      region: '서울특별시',
      location: { lat: 37.498, lng: 127.028 },
    },
  ],
  operations: [
    {
      id: 'sample-cityhall-cheap',
      fee: {
        baseFee: 500,
        baseTimeMin: 30,
        addFee: 200,
        addTimeMin: 10,
        dailyMaxFee: 10000,
      },
    },
    {
      id: 'sample-cityhall-balance',
      fee: {
        baseFee: 1000,
        baseTimeMin: 30,
        addFee: 500,
        addTimeMin: 10,
        dailyMaxFee: 20000,
      },
    },
    {
      id: 'sample-cityhall-far',
      fee: { baseFee: 2000, baseTimeMin: 30, addFee: 500, addTimeMin: 10 },
    },
    { id: 'sample-gangnam', fee: null },
  ],
}
