import { act, renderHook, waitFor, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createJourneyService } from '../services/journey'
import { useJourney } from './useJourney'
afterEach(cleanup)
describe('입력 수정과 순서 변경', () => {
  it('검색 중 수정하면 뒤늦은 이전 응답이 화면을 덮지 않는다', async () => {
    const service = createJourneyService()
    let resolve!: (orders: Awaited<ReturnType<typeof service.order>>) => void
    service.order = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof service.order>>>((r) => {
          resolve = r
        }),
    )
    service.parking = vi.fn(service.parking)
    const { result } = renderHook(() => useJourney(service))
    let pending!: Promise<void>
    act(() => {
      pending = result.current.start()
    })
    expect(result.current.busy).toBe(true)
    act(() => result.current.updateWaypoint('visit-1', { dwellMin: 90 }))
    expect(result.current.busy).toBe(false)
    await act(async () => {
      resolve([{ order: ['visit-1', 'visit-2'], totalSec: 1 }])
      await pending
    })
    expect(result.current.stage).toBe('input')
    expect(result.current.draft.waypoints[0].dwellMin).toBe(90)
    expect(service.parking).not.toHaveBeenCalled()
  })
  it('주차 선택 중 순서를 옮기면 이전 후보를 지우고 새 순서를 고정한다', async () => {
    const { result } = renderHook(() => useJourney(createJourneyService()))
    await act(async () => {
      await result.current.start()
    })
    await waitFor(() => expect(result.current.stage).toBe('parking'))
    const ids = result.current.draft.waypoints.map((w) => w.id)
    act(() => result.current.moveWaypoint(ids[1], ids[0]))
    expect(result.current.stage).toBe('input')
    expect(result.current.candidates).toEqual([])
    expect(result.current.selections).toEqual({})
    expect(result.current.draft.waypoints.map((w) => w.id)).toEqual([
      ids[1],
      ids[0],
    ])
    expect(result.current.draft.waypoints.map((w) => w.fixedIndex)).toEqual([
      0, 1,
    ])
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.order).toEqual([ids[1], ids[0]])
  })
})
