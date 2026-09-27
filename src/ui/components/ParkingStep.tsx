import type { JourneyState } from '../hooks/useJourney'
import { placeById } from '../services/places'
import { calculateParkingFee } from '@features/parking/fee'
import { won } from '../services/display'

export function ParkingStep({ flow }: { flow: JourneyState }) {
  const waypoint = flow.draft.waypoints.find(
    (w) => w.id === flow.order[flow.parkingIndex],
  )!
  return (
    <section className="panel" aria-labelledby="parking-title">
      <p className="eyebrow">02 / 주차장 선택</p>
      <h2 id="parking-title" tabIndex={-1}>
        {['첫 번째', '두 번째', '세 번째'][flow.parkingIndex]} 주차장
      </h2>
      <p className="muted">
        {placeById(waypoint.placeId).name} · 체류 {waypoint.dwellMin}분
      </p>
      <div className="section-label">
        <span className="tag">
          선택 완료 {Object.keys(flow.selections).length} / {flow.order.length}
        </span>
        <button className="text-button" onClick={flow.edit}>
          입력 수정
        </button>
      </div>
      <fieldset className="parking-options" disabled={flow.busy}>
        <legend className="sr-only">주차장 후보</legend>
        {flow.candidates.map((lot, index) => {
          const fee = calculateParkingFee(lot.fee, waypoint.dwellMin)
          return (
            <label
              className={`parking-card ${flow.highlighted === lot.id ? 'selected' : ''}`}
              key={lot.id}
            >
              <input
                type="radio"
                name="parking"
                checked={flow.highlighted === lot.id}
                onChange={() => flow.setHighlighted(lot.id)}
              />
              <div>
                <span className="tag">P{index + 1}</span>
                <h3>{lot.name}</h3>
                <p className="muted">
                  직선거리 {Math.round(lot.distanceToWaypointM)}m
                </p>
                <strong>
                  {fee === null ? '요금 정보 없음' : `${won(fee)} 예상`}
                </strong>
              </div>
            </label>
          )
        })}
      </fieldset>
      {!flow.candidates.length && (
        <div className="empty-state">
          <strong>반경 1km 안에 샘플 주차장이 없습니다.</strong>
          <p>서울시청 또는 덕수궁으로 경유지를 바꿔 체험해보세요.</p>
        </div>
      )}
      <p className="footnote">
        표시 요금은 체류시간 기준 예상값입니다. 자차와 혼합 경로에 같은 주차장이
        적용됩니다.
      </p>
      <button
        className="primary-button"
        disabled={flow.busy || !flow.highlighted}
        onClick={() => void flow.chooseParking()}
      >
        {flow.busy ? '계산 중…' : '이 주차장 선택'}{' '}
        <span aria-hidden="true">→</span>
      </button>
    </section>
  )
}
