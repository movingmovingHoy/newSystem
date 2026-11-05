import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWaypointDrag } from './useWaypointDrag'
class TestPointerEvent extends MouseEvent {
  pointerId: number
  pointerType: string
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.pointerType = init.pointerType ?? 'mouse'
  }
}
const originalHitTest = Object.getOwnPropertyDescriptor(
  document,
  'elementFromPoint',
)
function Harness({ move }: { move: (id: string, target: string) => void }) {
  const drag = useWaypointDrag(move)
  return (
    <>
      <button {...drag.handle('a')}>이동</button>
      <div data-waypoint-id="b" data-testid="target" />
      <span>{drag.dragging ? '드래그 중' : '대기'}</span>
    </>
  )
}
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  if (originalHitTest)
    Object.defineProperty(document, 'elementFromPoint', originalHitTest)
  else Reflect.deleteProperty(document, 'elementFromPoint')
})
describe('길게 눌러 순서 이동', () => {
  it('마우스와 터치 모두 길게 누른 뒤 놓은 위치로 이동한다', () => {
    vi.useFakeTimers()
    vi.stubGlobal('PointerEvent', TestPointerEvent)
    for (const pointerType of ['mouse', 'touch']) {
      const move = vi.fn()
      render(<Harness move={move} />)
      const button = screen.getByText('이동')
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: () => screen.getByTestId('target'),
      })
      fireEvent.pointerDown(button, {
        button: 0,
        clientX: 10,
        clientY: 10,
        pointerType,
      })
      act(() => vi.advanceTimersByTime(300))
      expect(screen.getByText('드래그 중')).toBeInTheDocument()
      fireEvent.pointerMove(button, { clientX: 10, clientY: 100, pointerType })
      fireEvent.pointerUp(button, { pointerType })
      expect(move).toHaveBeenCalledWith('a', 'b')
      cleanup()
    }
  })
  it('짧은 누름과 취소는 이동하지 않는다', () => {
    vi.useFakeTimers()
    vi.stubGlobal('PointerEvent', TestPointerEvent)
    const move = vi.fn()
    render(<Harness move={move} />)
    const button = screen.getByText('이동')
    fireEvent.pointerDown(button, { button: 0 })
    fireEvent.pointerUp(button)
    act(() => vi.advanceTimersByTime(300))
    expect(screen.getByText('대기')).toBeInTheDocument()
    fireEvent.pointerDown(button, { button: 0 })
    act(() => vi.advanceTimersByTime(300))
    fireEvent.pointerCancel(button)
    fireEvent.pointerUp(button)
    expect(move).not.toHaveBeenCalled()
  })
})

it('PC의 일반 드래그는 지원하고 빠른 터치 이동은 취소한다', () => {
  vi.useFakeTimers()
  vi.stubGlobal('PointerEvent', TestPointerEvent)
  const move = vi.fn()
  render(<Harness move={move} />)
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => screen.getByTestId('target'),
  })
  const button = screen.getByText('이동')
  fireEvent.pointerDown(button, {
    button: 0,
    clientX: 0,
    clientY: 0,
    pointerType: 'touch',
  })
  fireEvent.pointerMove(button, {
    clientX: 0,
    clientY: 100,
    pointerType: 'touch',
  })
  fireEvent.pointerUp(button, { pointerType: 'touch' })
  expect(move).not.toHaveBeenCalled()
  fireEvent.pointerDown(button, {
    button: 0,
    clientX: 0,
    clientY: 0,
    pointerType: 'mouse',
  })
  fireEvent.pointerMove(button, {
    clientX: 0,
    clientY: 100,
    pointerType: 'mouse',
  })
  fireEvent.pointerUp(button, { pointerType: 'mouse' })
  expect(move).toHaveBeenCalledWith('a', 'b')
})
