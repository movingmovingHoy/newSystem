import { MAX_WAYPOINTS, type Preference } from '@shared/config'
import type { JourneyState } from '../hooks/useJourney'
import { PlacePicker } from './PlacePicker'
import { Icon } from './Icons'
import { useWaypointDrag } from '../hooks/useWaypointDrag'
import { placeById } from '../services/catalog'
export function Sidebar({ flow }: { flow: JourneyState }) {
  const { draft } = flow
  const drag = useWaypointDrag(flow.moveWaypoint)
  return (
    <aside className="sidebar">
      <div className="sidebar-heading">
        <span className="eyebrow">YOUR NEXT MOVE</span>
        <h1>어디로 떠나세요?</h1>
        <p>차를 두고, 가볍게 도착하는 방법.</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void flow.start()
        }}
      >
        <fieldset className="native-fieldset">
          <div className="mode-tabs">
            <button type="button" data-state="active">
              <Icon name="car" />
              자차 이용
            </button>
            <button
              type="button"
              disabled
              title="택시는 현재 MVP 범위에 포함되지 않습니다."
            >
              <Icon name="arrow" />
              택시 이용
            </button>
          </div>
          <div className="location-fields">
            <div className="field-block">
              <label>출발지</label>
              <div className="location-row">
                <span className="location-dot" />
                <PlacePicker
                  kind="origin"
                  value={draft.originId}
                  onChange={(originId) => flow.update({ originId })}
                  label="출발지 선택"
                />
              </div>
            </div>
            {draft.waypoints.map((w, index) => (
              <div
                className="field-block waypoint-card"
                key={w.id}
                data-waypoint-id={w.id}
                data-dragging={drag.dragging === w.id || undefined}
                data-drop-target={
                  (drag.over === w.id && drag.dragging !== w.id) || undefined
                }
              >
                <div className="waypoint-heading">
                  <label>도착지 {index + 1}</label>
                  <button
                    type="button"
                    className="waypoint-grip native-button"
                    aria-label={`도착지 ${index + 1} 순서 이동`}
                    aria-describedby="waypoint-drag-help"
                    disabled={draft.waypoints.length < 2}
                    {...drag.handle(w.id)}
                    onKeyDown={(e) => {
                      drag.handle(w.id).onKeyDown(e)
                      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
                      e.preventDefault()
                      const target =
                        draft.waypoints[index + (e.key === 'ArrowUp' ? -1 : 1)]
                      if (target) flow.moveWaypoint(w.id, target.id)
                    }}
                  >
                    <span aria-hidden="true">⠿</span>
                    <span>순서 이동</span>
                  </button>
                </div>
                <div className="location-row">
                  <span className="destination-number">{index + 1}</span>
                  <PlacePicker
                    value={w.placeId}
                    onChange={(placeId) =>
                      flow.updateWaypoint(w.id, { placeId })
                    }
                    label={`도착지 ${index + 1} 장소`}
                  />
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`도착지 ${index + 1} 삭제`}
                    disabled={draft.waypoints.length <= 1}
                    onClick={() => flow.removeWaypoint(w.id)}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
                <div className="waypoint-settings">
                  <label>
                    체류 (분)
                    <input
                      aria-label={`도착지 ${index + 1} 체류시간`}
                      required
                      type="number"
                      min="0"
                      step="1"
                      value={Number.isNaN(w.dwellMin) ? '' : w.dwellMin}
                      onChange={(e) => {
                        // 빈 값이면 0으로 두어 NaN 이 draft 에 저장돼
                        // 경로찾기 검증에서 조용히 실패하는 것을 막는다.
                        const next = e.target.valueAsNumber
                        flow.updateWaypoint(w.id, {
                          dwellMin: Number.isNaN(next) ? 0 : next,
                        })
                      }}
                    />
                  </label>
                </div>
              </div>
            ))}
            <button
              className="add-stop native-button"
              type="button"
              aria-label="도착지 추가"
              disabled={draft.waypoints.length >= MAX_WAYPOINTS}
              onClick={flow.addWaypoint}
            >
              <Icon name="plus" size={16} />
              도착지 추가<span>최대 {MAX_WAYPOINTS}곳</span>
            </button>
            <p className="field-hint" id="waypoint-drag-help">
              ‘순서 이동’을 꾹 누른 채 위아래로 끌어주세요. 키보드는 ↑ ↓로
              이동해요.
              {draft.waypoints.some((w) => w.fixedIndex !== undefined)
                ? ' 지정한 순서대로 방문해요.'
                : ' 검색 시 빠른 방문 순서를 추천해요.'}
            </p>
            {draft.waypoints.some((w) => w.fixedIndex !== undefined) && (
              <button
                type="button"
                className="native-button order-auto"
                onClick={() =>
                  flow.update({
                    waypoints: draft.waypoints.map((w) => ({
                      ...w,
                      fixedIndex: undefined,
                    })),
                  })
                }
              >
                자동 순서 추천으로 되돌리기
              </button>
            )}
            <span className="sr-only" role="status">
              {drag.dragging
                ? '이동할 위치로 끌어 놓으세요.'
                : `방문 순서: ${draft.waypoints.map((w, i) => `${i + 1}번 ${placeById(w.placeId).name}`).join(', ')}`}
            </span>
          </div>
          <div className="stay-box">
            <div className="check-label">
              <Icon name="parking" size={17} />
              주차비도 함께 비교해요
            </div>
            <p>도착지별 체류시간으로 예상 요금을 계산해요.</p>
          </div>
          <div className="data-controls">
            <label htmlFor="departure">출발 시각 · 한국 시간</label>
            <input
              id="departure"
              className="native-input"
              required
              type="datetime-local"
              value={draft.departAt}
              onChange={(e) => flow.update({ departAt: e.target.value })}
            />
            <label className="scenario-label" htmlFor="preference">
              이동 성향
            </label>
            <select
              id="preference"
              value={draft.preference}
              onChange={(e) =>
                flow.update({ preference: e.target.value as Preference })
              }
            >
              <option value="time">시간 우선</option>
              <option value="cost">비용 우선</option>
              <option value="lowStamina">체력 약함</option>
            </select>
            <label className="scenario-label" htmlFor="data-source">
              데이터 모드
            </label>
            <p id="data-source">
              {flow.live
                ? '카카오·ODsay·공영주차장 조회 / 도보 추정'
                : '테스트 데이터'}
            </p>
          </div>
          <button
            type="submit"
            disabled={flow.busy}
            className="search-button native-button"
            aria-label={
              draft.waypoints.length > 1 ? '주차장 찾기' : '경로 비교하기'
            }
          >
            <Icon name="route" />
            {flow.busy ? '경로를 비교하고 있어요…' : '더 나은 경로 찾기'}
            <Icon name="arrow" />
          </button>
        </fieldset>
      </form>
      <div className="sidebar-footer">
        <span className="tiny-logo">
          <Icon name="route" size={17} />
        </span>
        <p>
          목적지까지 타는 것만이
          <br />
          정답은 아니니까.
        </p>
      </div>
    </aside>
  )
}
