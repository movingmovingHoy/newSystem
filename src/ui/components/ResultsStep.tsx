import { useState } from 'react'
import { rankRoutes, RANK_LABELS, type RankCriterion } from '@features/routing'
import type { Route } from '@shared/types'
import type { JourneyState } from '../hooks/useJourney'
import { placeById } from '../services/places'
import { departureIso } from '../services/journey'
import {
  displayTimeline,
  minutes,
  scenarioNames,
  time,
  won,
} from '../services/display'

export function ResultsStep({
  flow,
  selected,
  onSelect,
}: {
  flow: JourneyState
  selected: Route
  onSelect: (route: Route) => void
}) {
  const [criterion, setCriterion] = useState<RankCriterion>('recommended')
  const routes = rankRoutes(flow.result!.routes, criterion)
  const timeline = displayTimeline(selected, flow.draft)
  return (
    <section className="results" aria-labelledby="results-title">
      <div className="section-label">
        <div>
          <p className="eyebrow">03 / 나에게 맞는 이동</p>
          <h2 id="results-title" tabIndex={-1}>
            경로 비교 결과
          </h2>
        </div>
        <button className="secondary-button" onClick={flow.edit}>
          입력 수정
        </button>
      </div>
      <p className="muted">
        이동 시간·비용·피로도를 함께 비교했어요. 점수가 낮을수록 추천합니다.
      </p>
      <div className="sort-tabs" aria-label="정렬 기준">
        {(Object.keys(RANK_LABELS) as RankCriterion[]).map((key) => (
          <button
            key={key}
            aria-pressed={criterion === key}
            onClick={() => setCriterion(key)}
          >
            {RANK_LABELS[key]}
          </button>
        ))}
      </div>
      <div className="route-cards">
        {routes.map((route) => (
          <button
            className={`route-card ${selected.scenario === route.scenario ? 'selected' : ''}`}
            key={route.scenario}
            aria-pressed={selected.scenario === route.scenario}
            onClick={() => onSelect(route)}
          >
            <span className="tag">
              {route === flow.result!.routes[0]
                ? '추천 경로'
                : '다른 이동 방법'}
            </span>
            <h3>{scenarioNames[route.scenario]}</h3>
            <strong className="route-time">
              {minutes(route.totals.durationSec)} <small>이동</small>
            </strong>
            <dl className="metrics">
              <div>
                <dt>예상 비용</dt>
                <dd>
                  {won(route.totals.cost)}
                  {route.totals.parkingCostPartial ? ' + 미확인 주차비' : ''}
                </dd>
              </div>
              <div>
                <dt>걷는 거리</dt>
                <dd>{Math.round(route.totals.walkDistanceM)}m</dd>
              </div>
              <div>
                <dt>피로도</dt>
                <dd>{route.totals.fatigue.toFixed(1)}</dd>
              </div>
              <div>
                <dt>종합점수</dt>
                <dd>{route.score.toFixed(1)}</dd>
              </div>
            </dl>
            {route.totals.parkingCostPartial && (
              <p className="notice">주차비 일부 정보 없음</p>
            )}
            <ul className="reasons">
              {route.reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
          </button>
        ))}
      </div>
      {flow.result!.routes.length < 3 && (
        <p className="footnote">
          자차와 혼합의 접근수단이 같으면 하나로 합쳐 보여드립니다.
        </p>
      )}
      <div className="panel timeline-panel">
        <div className="section-label">
          <h3>내 여정 타임라인</h3>
          <span className="tag">{scenarioNames[selected.scenario]}</span>
        </div>
        <p className="footnote">
          체류시간 포함 · 한국 시간 / 혼잡도는 통계 기반 추정
        </p>
        <ol className="timeline">
          <li>
            <span className="timeline-time">
              {time(departureIso(flow.draft))} 출발
            </span>
            <strong>{placeById(flow.draft.originId).name}</strong>
          </li>
          {timeline.visits.map((visit, index) => (
            <li key={index}>
              <span className="timeline-time">
                {time(visit.arriveAt)} 도착 → {time(visit.departAt)} 출발
              </span>
              <strong>{visit.name}</strong>
              <span className="muted">체류 {visit.dwellMin}분</span>
              <span className="tag">{visit.congestion}</span>
            </li>
          ))}
          <li>
            <span className="timeline-time">
              최종 도착 · {time(timeline.finalArriveAt)}
            </span>
            <strong>{placeById(flow.draft.destinationId).name}</strong>
            <span className="tag">혼잡: 정보 없음</span>
          </li>
        </ol>
        {flow.orders.length > 1 && (
          <label>
            방문 순서 변경
            <select
              aria-label="방문 순서 변경"
              disabled={flow.busy}
              value={flow.orders.findIndex(
                (o) => o.order.join() === flow.order.join(),
              )}
              onChange={(e) => void flow.changeOrder(Number(e.target.value))}
            >
              {flow.orders.map((o, index) => (
                <option value={index} key={o.order.join()}>
                  {index + 1}안 ·{' '}
                  {o.order
                    .map(
                      (id) =>
                        placeById(
                          flow.draft.waypoints.find((w) => w.id === id)!
                            .placeId,
                        ).name,
                    )
                    .join(' → ')}
                </option>
              ))}
            </select>
            <span className="footnote">
              순서를 바꾸면 주차장을 처음부터 다시 선택합니다.
            </span>
          </label>
        )}
      </div>
    </section>
  )
}
