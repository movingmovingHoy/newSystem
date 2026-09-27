import { useEffect, useState } from 'react'
import type { PlanResult } from '@features/routing'
import {
  createInitialDraft,
  createJourneyService,
  type JourneyDraft,
} from '../services/journey'

export function usePreview() {
  const [preview, setPreview] = useState<{
    draft: JourneyDraft
    result: PlanResult
  } | null>(null)
  useEffect(() => {
    let active = true
    const draft = createInitialDraft(),
      service = createJourneyService()
    const load = async () => {
      const order = (await service.order(draft))[0].order
      const selected = Object.fromEntries(
        await Promise.all(
          draft.waypoints.map(async (w) => [
            w.id,
            (await service.parking(w))[0],
          ]),
        ),
      )
      const result = await service.calculate(draft, order, selected)
      if (active) setPreview({ draft, result })
    }
    void load().catch(() => {
      /* 미리보기가 실패해도 사용자 입력은 계속 가능하다. */
    })
    return () => {
      active = false
    }
  }, [])
  return preview
}
