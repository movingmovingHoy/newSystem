import type { JourneyState } from '../hooks/useJourney'
import { placeById } from '../services/catalog'
import { calculateParkingFee } from '@features/parking/fee'
import { won } from '../services/display'
import { Icon } from './Icons'
export function ParkingChoices({ flow }: { flow: JourneyState }) {
  const w = flow.draft.waypoints.find(
    (item) => item.id === flow.order[flow.parkingIndex],
  )!
  return (
    <section className="parking-candidates" aria-label="주차장 선택">
      <div className="options-heading">
        <h3 tabIndex={-1}>
          {['첫 번째', '두 번째', '세 번째'][flow.parkingIndex]} 주차장
        </h3>
        <span>
          선택 완료 {Object.keys(flow.selections).length} / {flow.order.length}
        </span>
      </div>
      <p className="parking-explainer">
        {placeById(w.placeId).name} · 체류 {w.dwellMin}분 · 반경 1km 안에서
        골라보세요.
      </p>
      {flow.candidates.map((lot, index) => {
        const fee = calculateParkingFee(lot.fee, w.dwellMin),
          active = flow.highlighted === lot.id
        return (
          <button
            key={lot.id}
            className={`parking-candidate ${active ? 'active' : ''}`}
            aria-pressed={active}
            disabled={flow.busy}
            onClick={() => flow.setHighlighted(lot.id)}
          >
            <span className="parking-letter">P{index + 1}</span>
            <span className="parking-name">
              <strong>{lot.name}</strong>
              <small>
                경유지에서 직선거리 {Math.round(lot.distanceToWaypointM)}m
              </small>
            </span>
            <span className="parking-price">
              <strong>{fee === null ? '요금 정보 없음' : won(fee)}</strong>
              <small>체류시간 기준 예상</small>
            </span>
            <span className={`parking-select ${active ? 'checked' : ''}`}>
              <Icon name={active ? 'check' : 'arrow'} size={14} />
            </span>
          </button>
        )
      })}
      {!flow.candidates.length && (
        <p className="options-empty">반경 1km 안에 샘플 주차장이 없습니다.</p>
      )}
      <p className="options-note">
        선택한 주차장은 자차와 혼합 경로에 함께 반영돼요. 요금 정보가 없어도
        선택할 수 있습니다.
      </p>
      <button
        className="search-button native-button parking-confirm"
        disabled={flow.busy || !flow.highlighted}
        onClick={() => void flow.chooseParking()}
      >
        {flow.busy ? '경로를 계산하고 있어요…' : '이 주차장 선택'}
        <Icon name="arrow" size={18} />
      </button>
    </section>
  )
}
