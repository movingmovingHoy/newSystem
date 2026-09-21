/**
 * 공통 타입 배럴. AGENTS.md 6장.
 * 담당 폴더 밖에서 이 타입을 수정하려면 먼저 사용자에게 알린다.
 */
export type { LatLng } from './geo'
export type {
  Mode,
  Leg,
  Scenario,
  Totals,
  Route,
  PlaceCongestion,
  Stop,
} from './route'
export type { Waypoint } from './waypoint'
export type { FeeInfo, ParkingLot } from './parking'
