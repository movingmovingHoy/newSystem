import { useEffect, useRef, useState, type PointerEvent } from 'react'

/** 전용 손잡이를 300ms 누른 뒤 이동. 짧은 터치·취소는 순서를 변경하지 않는다. */
export function useWaypointDrag(move: (id: string, targetId: string) => void) {
  const pending = useRef<{
    id: string
    target: string
    pointer: number
    active: boolean
    x: number
    y: number
  } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pending.current = null
    setDragging(null)
    setOver(null)
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const start = (id: string, e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || pending.current) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const entry = {
      id,
      target: id,
      pointer: e.pointerId,
      active: false,
      x: e.clientX,
      y: e.clientY,
    }
    pending.current = entry
    timer.current = setTimeout(() => {
      entry.active = true
      setDragging(id)
      setOver(id)
    }, 300)
  }
  const motion = (e: PointerEvent<HTMLButtonElement>) => {
    const entry = pending.current
    if (!entry || entry.pointer !== e.pointerId) return
    if (!entry.active) {
      if (Math.hypot(e.clientX - entry.x, e.clientY - entry.y) <= 10) return
      if (e.pointerType !== 'mouse') {
        clear()
        return
      }
      // PC에서는 일반 드래그도 허용하고, 터치에서는 길게 누름으로 오동작을 방지한다.
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      entry.active = true
      setDragging(entry.id)
    }
    const target = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest<HTMLElement>('[data-waypoint-id]')?.dataset.waypointId
    entry.target = target ?? entry.id
    setOver(target ?? null)
  }
  const finish = (e: PointerEvent<HTMLButtonElement>) => {
    const entry = pending.current
    if (!entry || entry.pointer !== e.pointerId) return
    if (entry.active && entry.target !== entry.id) move(entry.id, entry.target)
    clear()
  }
  return {
    dragging,
    over,
    handle: (id: string) => ({
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => start(id, e),
      onPointerMove: motion,
      onPointerUp: finish,
      onPointerCancel: clear,
      onLostPointerCapture: clear,
      onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'Escape') clear()
      },
    }),
  }
}
