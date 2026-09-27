import { MAX_WAYPOINTS, type Preference } from '@shared/config'
import type { JourneyState } from '../hooks/useJourney'
import { places } from '../services/places'

function PlaceOptions() {
  return (
    <>
      {places.map((place) => (
        <option key={place.id} value={place.id}>
          {place.name}
        </option>
      ))}
    </>
  )
}
export function InputStep({ flow }: { flow: JourneyState }) {
  const { draft } = flow
  return (
    <section className="panel input-panel" aria-labelledby="input-title">
      <p className="eyebrow">01 / 여정 만들기</p>
      <h2 id="input-title" tabIndex={-1}>
        어디로 떠나시나요?
      </h2>
      <p className="muted">
        들를 곳까지 한 번에, 나에게 맞는 이동 방법을 찾아요.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void flow.start()
        }}
      >
        <fieldset disabled={flow.busy} className="form-fields">
          <div className="endpoints">
            <label>
              출발지
              <select
                value={draft.originId}
                onChange={(e) => flow.update({ originId: e.target.value })}
              >
                <PlaceOptions />
              </select>
            </label>
            <span className="direction" aria-hidden="true">
              ↓
            </span>
            <label>
              도착지
              <select
                value={draft.destinationId}
                onChange={(e) => flow.update({ destinationId: e.target.value })}
              >
                <PlaceOptions />
              </select>
            </label>
          </div>
          <label>
            출발 시각 <span className="muted">한국 시간</span>
            <input
              required
              type="datetime-local"
              value={draft.departAt}
              onChange={(e) => flow.update({ departAt: e.target.value })}
            />
          </label>
          <div className="section-label">
            <h3>
              들를 곳{' '}
              <span className="muted">
                {draft.waypoints.length} / {MAX_WAYPOINTS}
              </span>
            </h3>
            <button
              type="button"
              className="text-button"
              onClick={flow.addWaypoint}
              disabled={draft.waypoints.length >= MAX_WAYPOINTS}
            >
              경유지 추가
            </button>
          </div>
          {draft.waypoints.map((w, index) => (
            <div className="waypoint-card" key={w.id}>
              <div className="section-label">
                <span className="tag">경유지 {index + 1}</span>
                <button
                  type="button"
                  className="text-button"
                  aria-label={`경유지 ${index + 1} 삭제`}
                  onClick={() => flow.removeWaypoint(w.id)}
                >
                  삭제
                </button>
              </div>
              <label>
                장소
                <select
                  aria-label={`경유지 ${index + 1} 장소`}
                  value={w.placeId}
                  onChange={(e) =>
                    flow.updateWaypoint(w.id, { placeId: e.target.value })
                  }
                >
                  <PlaceOptions />
                </select>
              </label>
              <div className="field-pair">
                <label>
                  체류시간 (분)
                  <input
                    aria-label={`경유지 ${index + 1} 체류시간`}
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={Number.isNaN(w.dwellMin) ? '' : w.dwellMin}
                    onChange={(e) =>
                      flow.updateWaypoint(w.id, {
                        dwellMin: e.target.valueAsNumber,
                      })
                    }
                  />
                </label>
                <label>
                  📌 방문 순번
                  <select
                    aria-label={`경유지 ${index + 1} 고정 순번`}
                    value={w.fixedIndex ?? ''}
                    onChange={(e) =>
                      flow.updateWaypoint(w.id, {
                        fixedIndex:
                          e.target.value === ''
                            ? undefined
                            : Number(e.target.value),
                      })
                    }
                  >
                    <option value="">자동 추천</option>
                    {draft.waypoints.map((_, slot) => (
                      <option
                        key={slot}
                        value={slot}
                        disabled={draft.waypoints.some(
                          (other) =>
                            other.id !== w.id && other.fixedIndex === slot,
                        )}
                      >
                        {slot + 1}번째 고정
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ))}
          <label>
            이동 성향
            <select
              value={draft.preference}
              onChange={(e) =>
                flow.update({ preference: e.target.value as Preference })
              }
            >
              <option value="time">시간 우선 · 빠르게 이동할래요</option>
              <option value="cost">비용 우선 · 알뜰하게 이동할래요</option>
              <option value="lowStamina">체력 약함 · 덜 걷고 싶어요</option>
            </select>
          </label>
          <button className="primary-button" type="submit">
            {flow.busy
              ? '방문 순서 계산 중…'
              : draft.waypoints.length
                ? '주차장 찾기'
                : '경로 비교하기'}{' '}
            <span aria-hidden="true">→</span>
          </button>
        </fieldset>
      </form>
    </section>
  )
}
