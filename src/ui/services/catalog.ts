import { listAreas, searchAreas } from '@features/congestion'
import type { PlaceResult } from '@features/routing/providers'
import { places, type Place } from './places'
export type SearchPlace = Place & { address?: string; areaCode?: string }
const initials = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const decompose = (text: string) =>
  Array.from(text.normalize('NFC').toLowerCase())
    .map((c) => {
      const i = initials.indexOf(c)
      return i < 0 ? c.normalize('NFD') : String.fromCharCode(0x1100 + i)
    })
    .join('')
    .replace(/\s/g, '')
export const matchesKorean = (name: string, query: string) => {
  const q = query.trim()
  if (q && Array.from(q).every((c) => initials.includes(c))) {
    const head = Array.from(name)
      .map((c) => {
        const n = c.charCodeAt(0) - 0xac00
        return n >= 0 && n <= 11171 ? initials[Math.floor(n / 588)] : c
      })
      .join('')
    return head.includes(q)
  }
  return decompose(name).includes(decompose(q))
}
const areaPlaces: SearchPlace[] = listAreas().map((a) => ({
  id: `area:${a.areaCode}`,
  name: a.areaName,
  address: a.category,
  location: a.center,
  areaCode: a.areaCode,
}))
const registry = new Map<string, SearchPlace>(
  [...places, ...areaPlaces].map((p) => [p.id, p]),
)
export function findAreas(query: string): SearchPlace[] {
  const codes = new Set(searchAreas(query).map((a) => a.areaCode))
  return areaPlaces.filter(
    (p) => codes.has(p.areaCode!) || matchesKorean(p.name, query),
  )
}
export function registerPlace(result: PlaceResult): SearchPlace {
  if (
    !Number.isFinite(result.location.lat) ||
    !Number.isFinite(result.location.lng)
  )
    throw new Error('장소 좌표가 올바르지 않습니다.')
  const id = `kakao:${result.location.lat}:${result.location.lng}:${result.name}`
  const place = { ...result, id }
  registry.set(id, place)
  return place
}
export function placeById(id: string): SearchPlace {
  const place = registry.get(id)
  if (!place) throw new Error('장소를 검색해서 선택해주세요.')
  return place
}
