import type { LatLng } from './geo'

export type Waypoint = {
  id: string
  location: LatLng
  /** 순번 고정. 없으면 유동 */
  fixedIndex?: number
  dwellMin: number
}
