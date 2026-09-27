/**
 * 서울시 주요 121장소 영역 shapefile → 경량 GeoJSON 변환.
 * 런타임에서 무거운 shp 파서를 쓰지 않도록 빌드타임에 1회 변환한다.
 * 데이터가 갱신되면: npm run build:areas 로 다시 생성.
 *
 * 좌표계는 WGS84 위경도(.prj 확인). 좌표는 GeoJSON 표준인 [경도, 위도] 순서.
 */
import { open } from 'shapefile'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const SHP_BASE =
  './data/서울시 주요 121장소 영역/서울시 주요 121장소 영역/서울시 주요 121장소 영역'
const OUT = './src/features/congestion/areas/areas.geo.json'

const source = await open(`${SHP_BASE}.shp`, `${SHP_BASE}.dbf`, {
  encoding: 'utf-8',
})

const features = []
while (true) {
  const result = await source.read()
  if (result.done) break
  const f = result.value
  const p = f.properties ?? {}
  features.push({
    type: 'Feature',
    properties: {
      areaCode: p.AREA_CD,
      areaName: p.AREA_NM,
      category: p.CATEGORY,
    },
    geometry: f.geometry, // Polygon / MultiPolygon, 좌표 [lng, lat]
  })
}

const geojson = { type: 'FeatureCollection', features }

await mkdir(dirname(OUT), { recursive: true })
await writeFile(OUT, JSON.stringify(geojson), 'utf-8')

console.log(`WROTE ${features.length} features -> ${OUT}`)
