import {
  describeTransitStep,
  meters,
  minutes,
  time,
  won,
} from '../services/display'
import type { JourneyEvent } from '../services/journeyEvents'
import { Icon } from './Icons'

/** 한 단계. 이동(차·대중교통)은 transit 색, 도보는 walk 색을 쓴다. */
function Step({
  tone,
  icon,
  children,
}: {
  tone?: 'walk' | 'transit'
  icon: Parameters<typeof Icon>[0]['name']
  children: React.ReactNode
}) {
  return (
    <div className={`journey-step ${tone ?? ''}`}>
      <span className="step-icon">
        <Icon name={icon} />
      </span>
      <div>{children}</div>
    </div>
  )
}

function EventStep({ event, live }: { event: JourneyEvent; live: boolean }) {
  switch (event.kind) {
    case 'start':
      return (
        <Step icon="pin">
          <div className="step-heading">
            <strong>{event.name}</strong>
          </div>
          <p>{time(event.at)} 출발</p>
        </Step>
      )
    case 'drive':
      return (
        <Step tone="transit" icon="car">
          <div className="step-heading">
            <strong>차로 이동</strong>
            <b>{minutes(event.durationSec)}</b>
          </div>
          <p>{event.to}까지</p>
          {event.congestedSec > 0 && (
            <small>정체 약 {minutes(event.congestedSec)} 포함</small>
          )}
        </Step>
      )
    case 'park':
      return (
        <Step icon="parking">
          <div className="step-heading">
            <strong>주차</strong>
          </div>
          <p className="segment-parking">
            {event.name ?? '주차장 정보 없음'}
            {' · '}
            {event.fee === null ? '요금 정보 없음' : won(event.fee)}
          </p>
          <p>{time(event.at)} 도착</p>
        </Step>
      )
    case 'walk':
      return (
        <Step tone="walk" icon="walk">
          <div className="step-heading">
            <strong>
              {event.direction === 'out' ? '걸어서 이동' : '걸어서 돌아오기'}
            </strong>
            <b>{minutes(event.durationSec)}</b>
          </div>
          <p>
            {event.direction === 'out'
              ? `${event.to}까지`
              : `주차장으로 · ${event.to}`}
            {event.distanceM > 0 && ` · ${meters(event.distanceM)}`}
          </p>
        </Step>
      )
    case 'stay':
      return (
        <Step icon="pin">
          <div className="step-heading">
            <strong>{event.name}</strong>
            <b>체류 {event.dwellMin}분</b>
          </div>
          <p>{time(event.at)} 도착</p>
          <p>{time(event.departAt)} 출발</p>
          <small>{event.congestion}</small>
        </Step>
      )
    case 'transit':
      return (
        <Step tone="transit" icon="train">
          <div className="step-heading">
            <strong>대중교통 이동</strong>
            <b>{minutes(event.durationSec)}</b>
          </div>
          <p>{event.to}까지</p>
          {event.steps.length > 0 && (
            <ul className="segment-detail">
              {event.steps.map((step, i) => (
                <li key={i} data-type={step.type}>
                  {describeTransitStep(step)}
                </li>
              ))}
            </ul>
          )}
        </Step>
      )
    case 'end':
      return (
        <Step tone="transit" icon="check">
          <div className="step-heading">
            <strong>{event.name}</strong>
          </div>
          <p>최종 도착 · {time(event.at)}</p>
          <small>
            {live
              ? '도착지 혼잡은 아래 추천 근거에 반영됩니다.'
              : '혼잡: 정보 없음'}
          </small>
        </Step>
      )
  }
}

/** 자차 계열 경로를 이동 순서대로 보여준다. 목록은 journeyEvents 가 만든다. */
export function CarJourney({
  events,
  live,
}: {
  events: JourneyEvent[]
  live: boolean
}) {
  return (
    <div className="journey">
      {events.map((event, index) => (
        <EventStep key={index} event={event} live={live} />
      ))}
      <div className="journey-end">
        <Icon name="check" size={14} />
        마지막 목적지 도착 · 일정 완료
      </div>
    </div>
  )
}
