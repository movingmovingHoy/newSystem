import { useEffect, useState } from 'react'
import { searchPlaces } from '@features/routing/providers'
import { findAreas, registerPlace, type SearchPlace } from '../services/catalog'
export function usePlaceSearch(
  query: string,
  kind: 'origin' | 'area',
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
    if (!open || kind !== 'origin' || query.trim().length < 2) return
    setLoading(true)
    const timer = setTimeout(() => {
      void searchPlaces(query.trim())
        .then((results) => {
          if (active) setRemote(results.map(registerPlace))
        })
        .catch(() => {
          if (active)
            setError(
              '카카오 검색에 실패했습니다. API 키와 연결 상태를 확인해주세요. 서울 121곳 추천은 선택할 수 있습니다.',
            )
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
  // 출발지(origin)는 전국 어디나 가능하므로 카카오 장소검색 결과만 쓴다.
  // 서울 121곳(local)은 혼잡도용이라 도착지(area)에서만 보여준다.
  if (kind === 'origin') {
    return { results: remote, loading, error }
  }
  const local = findAreas(query)
  return { results: local, loading, error }
}
