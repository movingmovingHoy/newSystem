import { useEffect, useRef, useState } from 'react'
import type { Route } from '@shared/types'
import type { MapPoint } from '../components/CoordinateMap'
import { Icon } from './Icons'

/** chalo 원본과 동일한 Web Mercator 투영·타일·컨트롤 배치. 경로 데이터만 현재 Route로 연결. */
export function RouteMap({
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
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(880),
    [zoom, setZoom] = useState(0),
    [tiles, setTiles] = useState(true),
    [traffic, setTraffic] = useState(true),
    [crowds, setCrowds] = useState(true)
  useEffect(() => {
    const node = container.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(280, entries[0].contentRect.width)),
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const height = width < 550 ? 360 : 390
  const project = (lng: number, lat: number) => {
    const r = (lat * Math.PI) / 180
    return [
      ((lng + 180) / 360) * 256,
      ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256,
    ]
  }
  const coords = [
    ...points.map((p) => p.location),
    ...(route?.legs.flatMap((l) => l.path ?? [l.from, l.to]) ?? []),
  ]
  const projected = coords.map((p) => project(p.lng, p.lat)),
    xs = projected.map((p) => p[0]),
    ys = projected.map((p) => p[1])
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys)
  const fit = Math.floor(
    Math.log2(
      Math.min(
        (width - 140) / Math.max(maxX - minX, 0.0001),
        (height - 160) / Math.max(maxY - minY, 0.0001),
      ),
    ),
  )
  const z = Math.max(8, Math.min(18, Math.min(16, fit) + zoom)),
    scale = 2 ** z
  const offset = [
    ((minX + maxX) / 2) * scale - width / 2,
    ((minY + maxY) / 2) * scale - height / 2,
  ]
  const xy = (lng: number, lat: number) => {
    const p = project(lng, lat)
    return [p[0] * scale - offset[0], p[1] * scale - offset[1]]
  }
  const images = []
  for (
    let x = Math.floor(offset[0] / 256);
    x <= Math.floor((offset[0] + width) / 256);
    x++
  )
    for (
      let y = Math.floor(offset[1] / 256);
      y <= Math.floor((offset[1] + height) / 256);
      y++
    )
      images.push({ x, y })
  return (
    <div className="route-map-wrap">
      <div className="map" ref={container} style={{ height }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label="예시 경로와 주차장 지도"
        >
          <rect width={width} height={height} className="map-background" />
          {tiles &&
            images.map((t) => (
              <image
                key={`${z}-${t.x}-${t.y}`}
                href={`https://tile.openstreetmap.org/${z}/${t.x}/${t.y}.png`}
                x={t.x * 256 - offset[0]}
                y={t.y * 256 - offset[1]}
                width="256"
                height="256"
                opacity=".7"
              />
            ))}
          {route?.legs.map((leg, index) => {
            const path = (leg.path ?? [leg.from, leg.to])
              .map((p, i) => `${i ? 'L' : 'M'}${xy(p.lng, p.lat).join(',')}`)
              .join(' ')
            return (
              <g
                key={index}
                className={`route-path ${leg.mode} ${traffic ? '' : 'monochrome'}`}
              >
                <path d={path} className="path-outline" />
                <path
                  d={path}
                  className={`path-line ${leg.path ? '' : 'estimated'}`}
                />
              </g>
            )
          })}
          {points.map((point, index) => {
            const [x, y] = xy(point.location.lng, point.location.lat),
              parking = point.kind === 'parking',
              clickable = parking && !!onSelect
            return (
              <g
                key={point.id}
                className={`chalo-marker ${parking ? 'parking' : ''} ${selected === point.id ? 'active' : ''}`}
                transform={`translate(${x},${y})`}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={
                  clickable ? `${point.label} 지도에서 선택` : undefined
                }
                onClick={() => clickable && onSelect?.(point.id)}
                onKeyDown={(e) => {
                  if (clickable && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    onSelect?.(point.id)
                  }
                }}
              >
                <title>{point.label}</title>
                <circle r={selected === point.id ? 20 : 16} />
                <text textAnchor="middle" dy="5" className="marker-text">
                  {parking ? 'P' : index === 0 ? '출발' : String(index)}
                </text>
                {width > 550 && (
                  <>
                    <rect
                      x="-66"
                      y={index % 2 ? 23 : -48}
                      width="132"
                      height="25"
                      rx="6"
                    />
                    <text
                      y={index % 2 ? 40 : -31}
                      textAnchor="middle"
                      className="marker-name"
                    >
                      {point.label.length > 12
                        ? point.label.slice(0, 11) + '…'
                        : point.label}
                    </text>
                  </>
                )}
              </g>
            )
          })}
        </svg>
        <div className="map-label">
          <Icon name="pin" size={15} />
          <span>DEMO · 예시 경로</span>
        </div>
        <div className="map-controls">
          <button
            className="icon-button"
            aria-label="지도 확대"
            disabled={zoom >= 3}
            onClick={() => setZoom((x) => x + 1)}
          >
            <Icon name="plus" />
          </button>
          <button
            className="icon-button"
            aria-label="지도 축소"
            disabled={zoom <= -2}
            onClick={() => setZoom((x) => x - 1)}
          >
            −
          </button>
          <button
            className="icon-button"
            aria-label="지도 전체 경로 보기"
            onClick={() => setZoom(0)}
          >
            <Icon name="reset" />
          </button>
          <button
            className="icon-button"
            aria-label="지도 배경 전환"
            aria-pressed={tiles}
            onClick={() => setTiles(!tiles)}
          >
            <Icon name="layers" />
          </button>
        </div>
        <div className="map-credit">
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap
          </a>
        </div>
      </div>
      <div className="map-details">
        <div className="map-layer-toggles">
          <button aria-pressed={traffic} onClick={() => setTraffic(!traffic)}>
            이동수단 색상 {traffic ? '켜짐' : '꺼짐'}
          </button>
          <button aria-pressed={crowds} onClick={() => setCrowds(!crowds)}>
            지역 인구 혼잡 {crowds ? '켜짐' : '꺼짐'}
          </button>
        </div>
        <div className="route-map-legend">
          <span>
            <i className="car-line" />
            자차
          </span>
          <span>
            <i className="dashed" />
            도보
          </span>
          <span>
            <i className="bus-line" />
            버스
          </span>
          <span>
            <i className="train-line" />
            지하철
          </span>
        </div>
        {crowds && (
          <div className="crowd-observations">
            <div>
              <span className="crowd-dot unknown" />
              <strong>방문 지역</strong>
              <b>혼잡: 정보 없음</b>
              <small>통계 기반 추정 · 실시간 조회 전</small>
            </div>
            <p>혼잡도 정보가 없는 지역은 음영으로 표시하지 않습니다.</p>
          </div>
        )}
        <p className="geometry-status">
          이동시간과 주차장은 예시입니다. 점선은 실제 도로가 아닌 지점 간
          연결입니다.
        </p>
      </div>
    </div>
  )
}
