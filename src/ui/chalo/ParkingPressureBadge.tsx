import type { Route } from '@shared/types'
import { PARKING_PRESSURE_THRESHOLD } from '@shared/config'
import {
  parkingPressureView,
  type ParkingPressureView,
} from '../services/display'
import './pressure.css'

/**
 * 목적지 주변 주차 포화율을 크게 보여준다. 표시만 하고 계산하지 않는다.
 * 색은 CSS 토큰(pressure.css)이 data-level 로 정한다. 하드코딩 금지(AGENTS.md 5장).
 *  - card: 경로 카드 안 (큰 숫자 + 미터 + 한 줄 문구)
 *  - detail: 상세 화면 맨 위 (더 큰 숫자 + 부가 설명)
 */
export function ParkingPressureBadge({
  view,
  size,
}: {
  view: ParkingPressureView
  size: 'card' | 'detail'
}) {
  const verdict =
    view.firstPercent !== null
      ? '추천 제외 · 첫 도착지도 포화'
      : view.recommended
        ? '주차 후 대중교통 추천'
        : '주차 여유'
  return (
    <div
      className="pressure-badge"
      data-size={size}
      data-level={view.level}
      data-recommended={view.recommended ? '' : undefined}
    >
      <div className="pressure-head">
        <span className="pressure-label">목적지 주변 주차 포화</span>
        <strong className="pressure-value">
          <span>{view.percent}</span>
          <small>%</small>
        </strong>
      </div>
      <div
        className="pressure-meter"
        role="meter"
        aria-label="목적지 주변 주차 포화율"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={view.percent}
      >
        <span style={{ width: `${Math.min(100, view.percent)}%` }} />
      </div>
      <p className="pressure-verdict">{verdict}</p>
      {size === 'detail' && (
        <p className="pressure-detail">
          주차 혼잡 점수 {view.score}점 ({PARKING_PRESSURE_THRESHOLD}점 이상이면
          추천)
          {view.firstPercent !== null &&
            ` · 첫 도착지 주변 포화 ${view.firstPercent}%`}
          {view.firstUnknown && ' · 첫 도착지 주변 주차 정보 없음'}
        </p>
      )}
    </div>
  )
}

/** 경로에 주차 압박 근거가 있을 때만 배지를 그린다 (park-transit 외에는 아무것도 그리지 않음). */
export function RouteParkingPressure({
  route,
  size,
}: {
  route: Route
  size: 'card' | 'detail'
}) {
  const view = parkingPressureView(route)
  return view ? <ParkingPressureBadge view={view} size={size} /> : null
}
