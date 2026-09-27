import type { LatLng, Route } from '@shared/types'
export type MapPoint = {
  id: string
  label: string
  location: LatLng
  kind: 'place' | 'parking'
}
export function CoordinateMap({
  points,
  route,
  selected,
  onSelect,
}: {
  points: MapPoint[]
  route?: Route
  selected?: string | null
  onSelect?: (id: string) => void
}) {
  const coordinates = [
    ...points.map((p) => p.location),
    ...(route?.legs.flatMap((l) => l.path ?? [l.from, l.to]) ?? []),
  ]
  const minLat = Math.min(...coordinates.map((p) => p.lat)),
    maxLat = Math.max(...coordinates.map((p) => p.lat))
  const minLng = Math.min(...coordinates.map((p) => p.lng)),
    maxLng = Math.max(...coordinates.map((p) => p.lng))
  const latSpan = Math.max(0.003, maxLat - minLat),
    lngSpan = Math.max(0.004, maxLng - minLng)
  const project = (p: LatLng) => ({
    x: 80 + ((p.lng - minLng) / lngSpan) * 490,
    y: 330 - ((p.lat - minLat) / latSpan) * 250,
  })
  return (
    <section className="map-panel" aria-label="여정 위치 미리보기">
      <div className="map-top">
        <span className="tag">SEOUL · 서울</span>
        <span className="muted">N ↑</span>
      </div>
      <svg
        className="coordinate-map"
        viewBox="0 0 680 430"
        role="group"
        aria-label="좌표 기반 위치 지도"
      >
        <title>좌표 기반 위치 지도. 실제 도로 지도가 아닙니다.</title>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <g key={i} className="map-grid">
            <line x1={i * 100 + 40} y1="35" x2={i * 100 + 40} y2="385" />
            <line x1="40" y1={i * 60 + 35} x2="640" y2={i * 60 + 35} />
          </g>
        ))}
        <text x="42" y="410" className="map-axis">
          {minLat.toFixed(3)}° N · {minLng.toFixed(3)}° E
        </text>
        {route?.legs.map((leg, i) => (
          <polyline
            key={i}
            className={`map-route ${leg.path ? '' : 'approximate'}`}
            points={(leg.path ?? [leg.from, leg.to])
              .map((p) => {
                const xy = project(p)
                return `${xy.x},${xy.y}`
              })
              .join(' ')}
          />
        ))}
        {points.map((p, index) => {
          const xy = project(p.location),
            interactive = p.kind === 'parking' && !!onSelect
          return (
            <g
              key={p.id}
              transform={`translate(${xy.x},${xy.y})`}
              className={`map-marker ${p.kind} ${selected === p.id ? 'active' : ''}`}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              aria-label={interactive ? `${p.label} 지도에서 선택` : undefined}
              onClick={() => interactive && onSelect?.(p.id)}
              onKeyDown={(e) => {
                if (interactive && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onSelect?.(p.id)
                }
              }}
            >
              <circle r={selected === p.id ? 22 : 17} />
              <text textAnchor="middle" dy="5" className="marker-number">
                {p.kind === 'parking'
                  ? `P${points.filter((q) => q.kind === 'parking').findIndex((q) => q.id === p.id) + 1}`
                  : index + 1}
              </text>
              <text
                textAnchor="middle"
                y={index % 2 ? -30 : 39}
                className="marker-label"
              >
                {p.label}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="map-bottom">
        <strong>이동의 큰 그림을 먼저 보세요.</strong>
        <p>좌표 기반 도식입니다. 점선은 실제 도로가 아닌 지점 간 연결입니다.</p>
      </div>
    </section>
  )
}
