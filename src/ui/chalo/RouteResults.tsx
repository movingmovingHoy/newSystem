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
  displayTimeline,
  minutes,
  scenarioNames,
  won,
} from '../services/display'
import { journeyEvents } from '../services/journeyEvents'
import { placeById } from '../services/catalog'
import { Icon } from './Icons'
import { CarJourney } from './CarJourney'
import { TransitJourney } from './TransitJourney'
import { RouteParkingPressure } from './ParkingPressureBadge'

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
  // 추천순은 planRoutes 가 정한 순서를 그대로 쓴다. 그 순서가 "주차 추천 기준에 못 미치는
  // park-transit 는 1위에서 뺀다"는 규칙을 이미 반영하고 있어서, 점수로 다시 정렬하면 어긋난다.
  const routes =
      sort === 'recommended' ? result.routes : rankRoutes(result.routes, sort),
    recommended = result.routes[0],
    timeline = displayTimeline(selected, draft, selections),
    events = journeyEvents(selected, draft, selections)
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
          {live
            ? 'API 조회 결과 · 공영주차장 · 도보 추정'
            : '테스트 데이터 기준'}{' '}
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
                      : '선택한 주차장에 세우고 걸어서 이동'}
                </span>
              </p>
              <div className="card-metrics">
                <strong>{minutes(route.totals.durationSec)}</strong>
                <span>{won(route.totals.cost)}</span>
              </div>
              <RouteParkingPressure route={route} size="card" />
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
      {selected.scenario === 'park-transit' && (
        <p className="options-note">
          이 방식은 첫 도착지 좌표에 주차하는 것으로 가정합니다. 선택한 실제
          주차장과 주차요금은 아직 반영하지 않습니다.
        </p>
      )}
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
        <RouteParkingPressure route={selected} size="detail" />
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
            <CarJourney events={events} live={live} />
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
              <span>피로도 · 낮을수록 편함</span>
              <b>{selected.totals.fatigue.toFixed(1)} / 100</b>
            </div>
            <div>
              <span>종합 부담도 · 낮을수록 좋음</span>
              <b>{selected.score.toFixed(1)} / 100</b>
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
          <p>혼잡도는 통계 기반 추정입니다.</p>
        </div>
      </div>
    </>
  )
}
