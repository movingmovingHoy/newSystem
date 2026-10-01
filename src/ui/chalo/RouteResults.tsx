import { useState } from 'react'
import {
  rankRoutes,
  type PlanResult,
  type RankCriterion,
} from '@features/routing'
import type { Route } from '@shared/types'
import type { JourneyDraft, ParkingSelections } from '../services/journey'
import { departureIso } from '../services/journey'
import {
  describeTransitStep,
  displayTimeline,
  meters,
  minutes,
  scenarioNames,
  time,
  won,
} from '../services/display'
import { placeById } from '../services/catalog'
import { Icon } from './Icons'
import { TransitJourney } from './TransitJourney'

export function RouteResults({
  live = false,
  result,
  draft,
  selected,
  selections,
  onSelect,
}: {
  live?: boolean
  result: PlanResult
  draft: JourneyDraft
  selected: Route
  selections?: ParkingSelections
  onSelect: (route: Route) => void
}) {
  const [sort, setSort] = useState<RankCriterion>('recommended')
  const routes = rankRoutes(result.routes, sort),
    recommended = result.routes[0],
    timeline = displayTimeline(selected, draft, selections)
  const isTransit = selected.scenario === 'transit-only'
  // 종점(순서상 마지막 도착지). "최종 도착지" 고정 개념이 없다.
  const endpointId = result.order.at(-1) ?? draft.waypoints[0]?.id
  const endpointWaypoint = draft.waypoints.find((w) => w.id === endpointId)
  const endpointPlace = endpointWaypoint
    ? placeById(endpointWaypoint.placeId)
    : placeById(draft.waypoints[0].placeId)
  const transportation = selected.legs.reduce((sum, leg) => sum + leg.cost, 0)
  const parkingCost = selected.stops.reduce(
    (sum, stop) => sum + (stop.parkingFee ?? 0),
    0,
  )
  return (
    <>
      <div className="routes-heading">
        <h3>
          이렇게 이동해보세요 <span>{routes.length}</span>
        </h3>
        <select
          className="sort-select"
          aria-label="추천 정렬"
          value={sort}
          onChange={(e) => setSort(e.target.value as RankCriterion)}
        >
          <option value="recommended">추천순</option>
          <option value="fastest">시간 짧은 순</option>
          <option value="cheapest">비용 낮은 순</option>
          <option value="leastWalk">도보 적은 순</option>
        </select>
      </div>
      <p className="recommendation-sentence">
        <span>차로의 추천</span>
        {scenarioNames[recommended.scenario]}로 이동하는 게 좋아요.
        <small>
          {live ? 'API 조회 결과 · 도보 추정·주차 샘플' : '테스트 데이터 기준'}{' '}
          · {minutes(recommended.totals.durationSec)} ·{' '}
          {won(recommended.totals.cost)}
          {recommended.totals.parkingCostPartial ? ' + 미확인 주차비' : ''}
        </small>
      </p>
      <div className="route-cards current-route-cards">
        {routes.map((route) => (
          <div className="route-card-wrapper" key={route.scenario}>
            <button
              className={`route-card ${selected.scenario === route.scenario ? 'selected' : ''}`}
              onClick={() => onSelect(route)}
              aria-pressed={selected.scenario === route.scenario}
            >
              <div className="card-top">
                <span
                  className={
                    route === recommended ? 'recommend-tag' : 'option-tag'
                  }
                >
                  {route === recommended
                    ? '추천 방식'
                    : route.scenario === 'transit-only'
                      ? '차 없이 이동'
                      : '대안 경로'}
                </span>
                {selected.scenario === route.scenario ? (
                  <span className="selected-check">
                    <Icon name="check" size={13} />
                  </span>
                ) : (
                  <span className="radio-circle" />
                )}
              </div>
              <h4>{scenarioNames[route.scenario]}</h4>
              <p className="card-point">
                <Icon
                  name={route.scenario === 'transit-only' ? 'train' : 'parking'}
                  size={14}
                />
                <span>
                  {route.scenario === 'transit-only'
                    ? '출발지부터 마지막 목적지까지'
                    : route.scenario === 'park-transit'
                      ? '첫 도착지에 주차 후 대중교통'
                      : '선택한 주차장에서 왕복 접근'}
                </span>
              </p>
              <div className="card-metrics">
                <strong>{minutes(route.totals.durationSec)}</strong>
                <span>{won(route.totals.cost)}</span>
              </div>
              <div className="card-bottom">
                <span>
                  <Icon name="walk" size={14} />
                  도보 {Math.round(route.totals.walkDistanceM)}m
                </span>
                <span>
                  {route.totals.parkingCostPartial
                    ? '주차비 일부 정보 없음'
                    : '총 예상 비용'}
                </span>
              </div>
            </button>
          </div>
        ))}
      </div>
      <section className={`detail-panel ${isTransit ? 'transit-panel' : ''}`}>
        <div className="detail-title">
          <div>
            <span className="eyebrow">YOUR ROUTE</span>
            <h3>{scenarioNames[selected.scenario]}</h3>
          </div>
          <span className="saving-badge">
            <Icon name="clock" size={15} />
            이동 {minutes(selected.totals.durationSec)}
          </span>
        </div>
        <div className="detail-columns">
          {isTransit ? (
            <TransitJourney
              route={selected}
              timeline={timeline}
              origin={placeById(draft.originId).name}
              endpoint={endpointPlace.name}
              departure={departureIso(draft)}
            />
          ) : (
            <div className="journey">
              <div className="journey-step">
                <span className="step-icon">
                  <Icon name="pin" />
                </span>
                <div>
                  <div className="step-heading">
                    <strong>{placeById(draft.originId).name}</strong>
                  </div>
                  <p>{time(departureIso(draft))} 출발</p>
                </div>
              </div>
              {timeline.visits.map((visit, index) => (
                <div
                  className={`journey-step ${visit.accessMode === 'transit' ? 'transit' : 'walk'}`}
                  key={index}
                >
                  <span className="step-icon">
                    <Icon
                      name={visit.accessMode === 'transit' ? 'train' : 'walk'}
                    />
                  </span>
                  <div>
                    <div className="step-heading">
                      <strong>{visit.name}</strong>
                      <b>체류 {visit.dwellMin}분</b>
                    </div>
                    <p>{time(visit.arriveAt)} 도착</p>
                    <p>{time(visit.departAt)} 출발</p>
                    {/* 이 도착지까지 어떻게 왔는지 (대중교통 승하차 / 도보) */}
                    {visit.transitSteps.length > 0 ? (
                      <ul className="segment-detail">
                        {visit.transitSteps.map((step, i) => (
                          <li key={i} data-type={step.type}>
                            {describeTransitStep(step)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      visit.accessWalkM > 0 && (
                        <p className="segment-walk">
                          도보 {meters(visit.accessWalkM)}
                        </p>
                      )
                    )}
                    {/* 자차/혼합: 주차장 정보 (없으면 정보 없음) */}
                    {!isTransit && (
                      <p className="segment-parking">
                        <Icon name="parking" size={13} />
                        {visit.parkingName
                          ? `주차 · ${visit.parkingName}`
                          : '주차 정보: 없음'}
                        {' · '}
                        {visit.parkingFee === null
                          ? '요금 정보 없음'
                          : won(visit.parkingFee)}
                      </p>
                    )}
                    <small>{visit.congestion}</small>
                  </div>
                </div>
              ))}
              <div className="journey-step transit">
                <span className="step-icon">
                  <Icon name="check" />
                </span>
                <div>
                  <div className="step-heading">
                    <strong>{endpointPlace.name}</strong>
                  </div>
                  {/* 종점까지 대중교통 구간 상세 (transit-only) */}
                  {timeline.endpointSteps.length > 0 && (
                    <ul className="segment-detail">
                      {timeline.endpointSteps.map((step, i) => (
                        <li key={i} data-type={step.type}>
                          {describeTransitStep(step)}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p>최종 도착 · {time(timeline.finalArriveAt)}</p>
                  <small>
                    {live
                      ? '도착지 혼잡은 아래 추천 근거에 반영됩니다.'
                      : '혼잡: 정보 없음'}
                  </small>
                </div>
              </div>
              <div className="journey-end">
                <Icon name="check" size={14} />
                마지막 목적지 도착 · 일정 완료
              </div>
            </div>
          )}
          <div className="cost-panel">
            <h4>
              <Icon name="wallet" size={17} />
              예상 비용
            </h4>
            <div>
              <span>교통비 · 통행료</span>
              <b>{won(transportation)}</b>
            </div>
            {selected.scenario !== 'transit-only' && (
              <div>
                <span>주차비</span>
                <b>
                  {selected.totals.parkingCostPartial
                    ? '일부 정보 없음'
                    : won(parkingCost)}
                </b>
              </div>
            )}
            <div className="cost-total">
              <span>
                {selected.totals.parkingCostPartial
                  ? '확인된 비용 소계'
                  : '총 예상 비용'}
              </span>
              <strong>{won(selected.totals.cost)}</strong>
            </div>
            <p>
              {selected.totals.parkingCostPartial
                ? '요금이 없는 주차장은 무료로 계산하지 않습니다. 실제 총비용은 더 높을 수 있어요.'
                : isTransit
                  ? '조회된 대중교통 예상 요금입니다.'
                  : '체류시간을 기준으로 계산한 예상 주차비를 포함합니다.'}
            </p>
            <div>
              <span>피로도</span>
              <b>{selected.totals.fatigue.toFixed(1)}</b>
            </div>
            <div>
              <span>종합점수 · 낮을수록 좋음</span>
              <b>{selected.score.toFixed(1)}</b>
            </div>
            <ul className="reason-list">
              {selected.reasons.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
            <a
              className="map-link"
              target="_blank"
              rel="noreferrer"
              href={`https://map.kakao.com/link/map/${encodeURIComponent(endpointPlace.name)},${endpointPlace.location.lat},${endpointPlace.location.lng}`}
            >
              마지막 목적지 위치 보기
              <Icon name="arrow" size={15} />
            </a>
          </div>
        </div>
      </section>
      <div className="result-footnote">
        <Icon name="info" size={16} />
        <div>
          <p>
            이동시간은 체류시간을 제외하며, 타임라인에는 체류시간을 포함합니다.
          </p>
          <p>
            혼잡도는 통계 기반 추정입니다. 자차와 혼합 경로가 같으면 하나로 합쳐
            표시해요.
          </p>
        </div>
      </div>
    </>
  )
}
