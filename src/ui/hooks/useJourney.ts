import {
  createLiveDraft,
  createLiveJourneyService,
} from '../services/liveJourney'
import { findAreas, placeById } from '../services/catalog'
import { useEffect, useRef, useState } from 'react'
import type { ParkingLot } from '@shared/types'
import type { PlanResult } from '@features/routing'
import type { Ordering } from '@features/routing/optimizer/optimizer'
import { DEFAULT_DWELL_MIN, MAX_WAYPOINTS } from '@shared/config'
import {
  createInitialDraft,
  type JourneyDraft,
  type JourneyService,
  type ParkingSelections,
  type WaypointDraft,
} from '../services/journey'

export function useJourney(service?: JourneyService) {
  const [api] = useState(() => service ?? createLiveJourneyService())
  const [draft, setDraft] = useState(() =>
    service ? createInitialDraft() : createLiveDraft(),
  )
  // 초기 draft 의 visit-N id 중 가장 큰 번호 다음부터 새 도착지 id 를 발급해
  // 기존 도착지와 id 가 충돌하지 않게 한다.
  const initialMaxVisit = useRef(
    draft.waypoints.reduce((max, w) => {
      const n = Number(w.id.replace('visit-', ''))
      return Number.isFinite(n) && n > max ? n : max
    }, 0),
  )
  const [stage, setStage] = useState<'input' | 'parking' | 'results'>('input')
  const [orders, setOrders] = useState<Ordering[]>([])
  const [order, setOrder] = useState<string[]>([])
  const [selections, setSelections] = useState<ParkingSelections>({})
  const [candidates, setCandidates] = useState<ParkingLot[]>([])
  const [parkingIndex, setParkingIndex] = useState(0)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const [result, setResult] = useState<PlanResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ticket = useRef(0)
  const nextId = useRef(initialMaxVisit.current + 1)
  useEffect(
    () => () => {
      ticket.current++
    },
    [],
  )
  const guard = async (
    operation: (current: () => boolean) => Promise<void>,
  ) => {
    const id = ++ticket.current
    setBusy(true)
    setError(null)
    try {
      await operation(() => ticket.current === id)
    } catch (e) {
      if (ticket.current === id)
        setError(
          e instanceof Error ? e.message : '처리 중 문제가 발생했습니다.',
        )
    } finally {
      if (ticket.current === id) setBusy(false)
    }
  }
  const loadParking = async (
    chosenOrder: string[],
    index: number,
    current: () => boolean,
  ) => {
    const w = draft.waypoints.find((item) => item.id === chosenOrder[index])!
    const lots = await api.parking(w)
    if (!current()) return
    setCandidates(lots)
    setHighlighted(lots[0]?.id ?? null)
    setParkingIndex(index)
    setStage('parking')
  }
  const startOrder = async (chosenOrder: string[], current: () => boolean) => {
    setOrder(chosenOrder)
    setSelections({})
    setResult(null)
    setCandidates([])
    setHighlighted(null)
    setParkingIndex(0)
    // 순서상 마지막 도착지는 종점이라 주차 선택이 없다. 앞쪽 도착지들만 주차.
    // 도착지가 1개뿐이면 주차 단계 없이 바로 결과를 계산한다.
    const parkingCount = chosenOrder.length - 1
    if (parkingCount > 0) await loadParking(chosenOrder, 0, current)
    else {
      const calculated = await api.calculate(draft, chosenOrder, {})
      if (current()) {
        setResult(calculated)
        setStage('results')
      }
    }
  }
  const start = () =>
    guard(async (current) => {
      const alternatives = await api.order(draft)
      if (!current()) return
      setOrders(alternatives)
      await startOrder(alternatives[0].order, current)
    })
  // 현재 도착지의 주차 선택(lot)을 반영하고 다음 단계로 진행한다.
  // lot 은 실제 주차장이거나, "주차장 없이 진행" sentinel 이다.
  const advanceParking = async (lot: ParkingLot, current: () => boolean) => {
    const next = { ...selections, [order[parkingIndex]]: lot }
    // 마지막 도착지(종점) 직전까지만 주차를 받는다. parkingCount = order.length - 1
    if (parkingIndex + 1 < order.length - 1) {
      await loadParking(order, parkingIndex + 1, current)
      if (current()) setSelections(next)
    } else {
      const calculated = await api.calculate(draft, order, next)
      if (current()) {
        setSelections(next)
        setResult(calculated)
        setStage('results')
      }
    }
  }
  const chooseParking = () =>
    guard(async (current) => {
      const lot = candidates.find((item) => item.id === highlighted)
      if (!lot) throw new Error('주차장을 선택해주세요.')
      await advanceParking(lot, current)
    })
  // 주차장 후보가 없을 때 A-1: 도착지 좌표 자체를 주차 지점으로 간주하고
  // (도보 0m, 요금 없음) 다음 단계로 넘어간다.
  const skipParking = () =>
    guard(async (current) => {
      const id = order[parkingIndex]
      const w = draft.waypoints.find((item) => item.id === id)!
      const location = placeById(w.placeId).location
      const sentinel: ParkingLot = {
        id: '',
        name: '주차장 없이 진행',
        location,
        fee: null,
        distanceToWaypointM: 0,
      }
      await advanceParking(sentinel, current)
    })
  const edit = () => {
    ticket.current++
    setBusy(false)
    setError(null)
    setStage('input')
    setSelections({})
    setResult(null)
  }
  const update = (patch: Partial<JourneyDraft>) =>
    setDraft((previous) => ({ ...previous, ...patch }))
  const updateWaypoint = (id: string, patch: Partial<WaypointDraft>) =>
    setDraft((previous) => ({
      ...previous,
      waypoints: previous.waypoints.map((w) =>
        w.id === id ? { ...w, ...patch } : w,
      ),
    }))
  const addWaypoint = () =>
    setDraft((previous) =>
      previous.waypoints.length >= MAX_WAYPOINTS
        ? previous
        : {
            ...previous,
            waypoints: [
              ...previous.waypoints,
              {
                id: `visit-${nextId.current++}`,
                placeId: service
                  ? 'deoksugung'
                  : (findAreas('덕수궁')[0] ?? findAreas('')[0]).id,
                dwellMin: DEFAULT_DWELL_MIN,
              },
            ],
          },
    )
  const removeWaypoint = (id: string) =>
    setDraft((previous) => {
      // 도착지는 최소 1개 유지. 마지막 하나는 삭제하지 않는다.
      if (previous.waypoints.length <= 1) return previous
      const index = previous.waypoints.findIndex((w) => w.id === id)
      return {
        ...previous,
        waypoints: previous.waypoints
          .filter((w) => w.id !== id)
          .map((w) => ({
            ...w,
            fixedIndex:
              w.fixedIndex === undefined
                ? undefined
                : w.fixedIndex > index
                  ? w.fixedIndex - 1
                  : w.fixedIndex === index
                    ? undefined
                    : w.fixedIndex,
          })),
      }
    })
  return {
    live: !service,
    draft,
    stage,
    orders,
    order,
    selections,
    candidates,
    parkingIndex,
    highlighted,
    result,
    busy,
    error,
    start,
    chooseParking,
    skipParking,
    edit,
    update,
    updateWaypoint,
    addWaypoint,
    removeWaypoint,
    setHighlighted,
    changeOrder: (index: number) =>
      guard((current) => startOrder(orders[index].order, current)),
  }
}
export type JourneyState = ReturnType<typeof useJourney>
