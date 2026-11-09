import { useEffect, useState } from 'react'
import { searchPlaces } from '@features/routing/providers'
import { registerPlace, type SearchPlace } from '../services/catalog'
import { isDemoMode, searchDemoPlaces } from '../services/demo'
export function usePlaceSearch(
  query: string,
  kind: 'origin' | 'destination',
  open: boolean,
) {
  const [remote, setRemote] = useState<SearchPlace[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setRemote([])
    setError('')
    setLoading(false)
    if (!open || query.trim().length < 2) return
    // 데모 모드: 카카오를 부르지 않고 샘플 장소·서울 주요 121곳에서 찾는다.
    if (isDemoMode()) {
      setRemote(searchDemoPlaces(query))
      return
    }
    setLoading(true)
    const timer = setTimeout(() => {
      const q = query.trim()
      const keyword =
        kind === 'destination' && !q.startsWith('서울') ? `서울 ${q}` : q
      void searchPlaces(keyword)
        .then((results) => {
          if (active)
            setRemote(
              results
                .filter(
                  (p) =>
                    p.name.trim() &&
                    Number.isFinite(p.location.lat) &&
                    Number.isFinite(p.location.lng) &&
                    (kind === 'origin' ||
                      /^서울(?:특별시)?(?:\s|$)/.test(p.address)),
                )
                .map(registerPlace),
            )
        })
        .catch(() => {
          if (active)
            setError('카카오 검색에 실패했습니다. 잠시 후 다시 시도해주세요.')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, 350)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query, kind, open])
  return { results: remote, loading, error }
}
