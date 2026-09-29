import type { Route, TransitStep } from '@shared/types'
import type { TimelineDisplay } from '../services/display'
import { meters, minutes, time, won } from '../services/display'
import { Icon } from './Icons'
import './transit.css'

function Steps({ steps }: { steps: TransitStep[] }) {
  return (
    <>
      <div className="transit-bar" aria-hidden="true">
        {steps.map((step, index) => (
          <span
            key={index}
            data-mode={step.type}
            data-line={step.line}
            style={{ flexGrow: Math.max(step.minutes, 1) }}
            title={`${step.line ?? '도보'} ${minutes(step.minutes * 60)}`}
          >
            <Icon
              name={step.type === 'subway' ? 'train' : step.type}
              size={14}
            />
            {minutes(step.minutes * 60)}
          </span>
        ))}
      </div>
      <ol className="transit-steps" aria-label="이동 구간">
        {steps.map((step, index) => (
          <li key={index} data-mode={step.type} data-line={step.line}>
            <span className="transit-node">
              <Icon name={step.type === 'subway' ? 'train' : step.type} />
            </span>
            <div className="transit-step-content">
              <div className="transit-step-heading">
                <strong>
                  {step.type === 'walk'
                    ? '도보'
                    : (step.line ?? (step.type === 'bus' ? '버스' : '지하철'))}
                </strong>
                <span>{minutes(step.minutes * 60)}</span>
              </div>
              {step.type === 'walk' ? (
                <p>
                  {step.distanceM > 0
                    ? `${meters(step.distanceM)} 이동`
                    : '다음 승차 위치로 이동'}
                </p>
              ) : (
                <>
                  <p className="transit-station">
                    {step.from ?? '승차 위치 정보 없음'} <span>승차</span>
                  </p>
                  {step.stationCount != null && (
                    <p>{step.stationCount}개 정거장 이동</p>
                  )}
                  <p className="transit-station">
                    {step.to ?? '하차 위치 정보 없음'} <span>하차</span>
                  </p>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </>
  )
}

export function TransitJourney({
  route,
  timeline,
  origin,
  endpoint,
  departure,
}: {
  route: Route
  timeline: TimelineDisplay
  origin: string
  endpoint: string
  departure: string
}) {
  return (
    <div className="transit-journey">
      <header className="transit-summary">
        <span className="transit-caption">대중교통 · 총 이동시간</span>
        <div className="transit-summary-main">
          <strong>{minutes(route.totals.durationSec)}</strong>
          <b>{won(route.totals.cost)}</b>
        </div>
        <p>
          {time(departure)} 출발 → {time(timeline.finalArriveAt)} 도착
        </p>
        <div className="transit-facts">
          <span>
            <Icon name="walk" size={16} />
            도보 {meters(route.totals.walkDistanceM)}
          </span>
        </div>
        {timeline.visits.length > 0 && (
          <small>도착 시각에는 경유지 체류시간이 포함됩니다.</small>
        )}
      </header>
      <div className="transit-place">
        <span className="transit-place-label">출발</span>
        <strong>{origin}</strong>
      </div>
      {route.legs.map((leg, index) => {
        const visit = timeline.visits[index]
        return (
          <section
            className="transit-leg"
            key={index}
            aria-label={`${index + 1}번째 이동`}
          >
            {leg.transitDetail?.length ? (
              <Steps steps={leg.transitDetail} />
            ) : leg.mode === 'walk' ? (
              <Steps
                steps={[
                  {
                    type: 'walk',
                    minutes: leg.durationSec / 60,
                    distanceM: leg.walkDistanceM,
                  },
                ]}
              />
            ) : (
              <p className="transit-unavailable">
                이동 {minutes(leg.durationSec)} · 세부 승하차 정보 없음
              </p>
            )}
            <div className="transit-place" data-end={!visit}>
              <span className="transit-place-label">
                {visit ? '경유' : '도착'}
              </span>
              <strong>{visit?.name ?? endpoint}</strong>
              <p>{time(visit?.arriveAt ?? timeline.finalArriveAt)} 도착</p>
              {visit && (
                <>
                  <p>
                    체류 {visit.dwellMin}분 · {time(visit.departAt)} 다시 출발
                  </p>
                  <small>{visit.congestion}</small>
                </>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
