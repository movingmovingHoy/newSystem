import type { LatLng } from '@shared/types'
export type Place = { id: string; name: string; location: LatLng }
export const places: Place[] = [
  { id: 'station', name: '서울역', location: { lat: 37.5547, lng: 126.9707 } },
  {
    id: 'cityhall',
    name: '서울시청',
    location: { lat: 37.5665, lng: 126.978 },
  },
  {
    id: 'deoksugung',
    name: '덕수궁',
    location: { lat: 37.5658, lng: 126.9751 },
  },
  {
    id: 'gwanghwamun',
    name: '광화문',
    location: { lat: 37.5759, lng: 126.9768 },
  },
  { id: 'gangnam', name: '강남역', location: { lat: 37.498, lng: 127.0276 } },
  {
    id: 'hongdae',
    name: '홍대입구역',
    location: { lat: 37.5572, lng: 126.9254 },
  },
]
export function placeById(id: string): Place {
  const place = places.find((p) => p.id === id)
  if (!place) throw new Error('장소를 선택해주세요.')
  return place
}
