import { useEffect, useRef, useState } from 'react'
import type { ParkingLot } from '@shared/types'
import type { PlanResult } from '@features/routing'
import type { Ordering } from '@features/routing/optimizer/optimizer'
import { DEFAULT_DWELL_MIN, MAX_WAYPOINTS } from '@shared/config'
import {
  createInitialDraft,
  createJourneyService,
  type JourneyDraft,
  type JourneyService,
  type ParkingSelections,
  type WaypointDraft,
} from '../services/journey'

export function useJourney(service?: JourneyService) {
  const [api] = useState(() => service ?? createJourneyService())
  const [draft, setDraft] = useState(createInitialDraft)
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
  const nextId = useRef(2)
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
    if (chosenOrder.length) await loadParking(chosenOrder, 0, current)
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
  const chooseParking = () =>
    guard(async (current) => {
      const lot = candidates.find((item) => item.id === highlighted)
      if (!lot) throw new Error('주차장을 선택해주세요.')
      const next = { ...selections, [order[parkingIndex]]: lot }
      if (parkingIndex + 1 < order.length) {
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
                placeId: 'deoksugung',
                dwellMin: DEFAULT_DWELL_MIN,
              },
            ],
          },
    )
  const removeWaypoint = (id: string) =>
    setDraft((previous) => {
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
