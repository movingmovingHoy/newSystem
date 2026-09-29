import type { LatLng, ParkingLot } from '@shared/types'
import {
  DEFAULT_DWELL_MIN,
  MAX_WAYPOINTS,
  type Preference,
} from '@shared/config'
import { planRoutes, type PlanProviders } from '@features/routing'
import {
  MockCarProvider,
  MockTransitProvider,
  MockWalkProvider,
} from '@features/routing/providers'
import { optimizeOrder, START_ID } from '@features/routing/optimizer/optimizer'
import {
  SampleParkingProvider,
  type ParkingProvider,
} from '@features/parking/providers'
import { findParkingCandidates } from '@features/parking/finder'
import { calculateParkingFee } from '@features/parking/fee'
import { placeById } from './catalog'

export type WaypointDraft = {
  id: string
  placeId: string
  dwellMin: number
  fixedIndex?: number
}
export type JourneyDraft = {
  originId: string
  departAt: string
  preference: Preference
  /** 도착지 목록 (최소 1개, 최대 MAX_WAYPOINTS개). "최종 도착지" 고정 개념 없음. */
  waypoints: WaypointDraft[]
}
export type ParkingSelections = Record<string, ParkingLot>
export function createInitialDraft(): JourneyDraft {
  const departAt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date())
    .replace(' ', 'T')
  return {
    originId: 'station',
    departAt,
    preference: 'time',
    waypoints: [
      { id: 'visit-1', placeId: 'cityhall', dwellMin: DEFAULT_DWELL_MIN },
      { id: 'visit-2', placeId: 'gangnam', dwellMin: DEFAULT_DWELL_MIN },
    ],
  }
}
export const departureIso = (draft: JourneyDraft) =>
  new Date(`${draft.departAt}:00+09:00`).toISOString()
export function validateDraft(draft: JourneyDraft): void {
  placeById(draft.originId)
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(draft.departAt) ||
    !Number.isFinite(Date.parse(`${draft.departAt}:00+09:00`))
  )
    throw new Error('출발 시각을 입력해주세요.')
  if (draft.waypoints.length < 1)
    throw new Error('도착지를 최소 1개 선택해주세요.')
  if (draft.waypoints.length > MAX_WAYPOINTS)
    throw new Error(`도착지는 최대 ${MAX_WAYPOINTS}개입니다.`)
  const fixed = new Set<number>()
  const ids = new Set<string>()
  for (const w of draft.waypoints) {
    placeById(w.placeId)
    if (ids.has(w.id)) throw new Error('도착지 ID가 중복되었습니다.')
    ids.add(w.id)
    if (!Number.isInteger(w.dwellMin) || w.dwellMin < 0)
      throw new Error('체류시간은 0 이상의 정수로 입력해주세요.')
    if (w.fixedIndex !== undefined) {
      if (
        !Number.isInteger(w.fixedIndex) ||
        w.fixedIndex < 0 ||
        w.fixedIndex >= draft.waypoints.length ||
        fixed.has(w.fixedIndex)
      )
        throw new Error('고정 순번이 중복되거나 범위를 벗어났습니다.')
      fixed.add(w.fixedIndex)
    }
  }
}

/** 화면은 서비스만 호출한다. 순서 계산과 경로 생성은 A 담당 모듈을 사용한다. */
export function createJourneyService(
  providers: PlanProviders = {
    car: new MockCarProvider(),
    walk: new MockWalkProvider(),
    transit: new MockTransitProvider(),
  },
  parkingProvider: ParkingProvider = new SampleParkingProvider(),
  congestionLevelAt?: (
    location: LatLng,
    arriveAt: Date,
  ) => Promise<number | null>,
) {
  return {
    async order(draft: JourneyDraft) {
      validateDraft(draft)
      const points = new Map([
        [START_ID, placeById(draft.originId).location],
        ...draft.waypoints.map(
          (w) => [w.id, placeById(w.placeId).location] as const,
        ),
      ])
      const table = new Map<string, number>()
      await Promise.all(
        [...points].flatMap(([from, location]) =>
          [...points]
            // START로 돌아오는 구간은 불필요. 그 외 도착지 간 구간은 모두 조회.
            .filter(([to]) => to !== from && to !== START_ID)
            .map(async ([to, target]) => {
              const legs = await providers.car.route({
                from: location,
                to: target,
                departAt: departureIso(draft),
              })
              if (!legs.length) throw new Error('구간 경로를 찾지 못했습니다.')
              table.set(
                `${from}:${to}`,
                legs.reduce((sum, leg) => sum + leg.durationSec, 0),
              )
            }),
        ),
      )
      return optimizeOrder({
        waypoints: draft.waypoints,
        legDurationSec: (from, to) => {
          const duration = table.get(`${from}:${to}`)
          if (duration === undefined)
            throw new Error('구간 소요시간이 없습니다.')
          return duration
        },
      }).orderings
    },
    parking(waypoint: WaypointDraft) {
      return findParkingCandidates(
        parkingProvider,
        placeById(waypoint.placeId).location,
        waypoint.dwellMin,
      )
    },
    async calculate(
      draft: JourneyDraft,
      order: string[],
      selections: ParkingSelections,
    ) {
      validateDraft(draft)
      if (
        order.length !== draft.waypoints.length ||
        new Set(order).size !== order.length ||
        order.some((id) => !draft.waypoints.some((w) => w.id === id))
      )
        throw new Error('방문 순서를 다시 선택해주세요.')
      // 순서상 마지막 도착지는 종점이라 주차/접근이 없다. 앞쪽 도착지들만
      // 주차장 선택이 필요하다. planRoutes 가 마지막을 종점으로 분리한다.
      const lastId = order[order.length - 1]
      return planRoutes(providers, {
        origin: placeById(draft.originId).location,
        departAt: departureIso(draft),
        preference: draft.preference,
        congestionLevelAt,
        waypoints: order.map((id, index) => {
          const w = draft.waypoints.find((item) => item.id === id)!
          const waypoint = {
            id,
            location: placeById(w.placeId).location,
            dwellMin: w.dwellMin,
            fixedIndex: index,
          }
          // 종점은 주차장이 필요 없다. planRoutes 가 종점의 주차 정보를
          // 사용하지 않으므로 플레이스홀더로 채운다.
          if (id === lastId) {
            return {
              waypoint,
              parkingLotId: '',
              parkingLocation: waypoint.location,
              parkingFee: null,
            }
          }
          const lot = selections[id]
          if (!lot) throw new Error('모든 도착지의 주차장을 선택해주세요.')
          return {
            waypoint,
            parkingLotId: lot.id,
            parkingLocation: lot.location,
            parkingFee: calculateParkingFee(lot.fee, w.dwellMin),
          }
        }),
      })
    },
  }
}
export type JourneyService = ReturnType<typeof createJourneyService>
