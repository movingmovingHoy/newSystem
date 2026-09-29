import { useEffect, useRef, useState } from 'react'
import type { Scenario } from '@shared/types'
import type { JourneyService } from '../services/journey'
import { useJourney } from '../hooks/useJourney'
import { placeById } from '../services/catalog'
import type { MapPoint } from '../components/CoordinateMap'
import { Sidebar } from './Sidebar'
import { RouteMap } from './RouteMap'
import { ParkingChoices } from './ParkingChoices'
import { RouteResults } from './RouteResults'
import { Icon } from './Icons'
import './source.css'
import './native.css'

export function ChaloApp({ service }: { service?: JourneyService }) {
  const flow = useJourney(service)
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const dialog = useRef<HTMLDialogElement>(null),
    content = useRef<HTMLElement>(null)
  const draft = flow.draft
  const result = flow.result
  const selected =
    result?.routes.find((r) => r.scenario === scenario) ?? result?.routes[0]
  // 종점(순서상 마지막 도착지). 결과가 있으면 확정 순서의 마지막, 없으면
  // 입력된 도착지 목록의 마지막을 쓴다. "최종 도착지" 고정 개념은 없다.
  const endpointId =
    (result?.order ?? draft.waypoints.map((w) => w.id)).at(-1) ??
    draft.waypoints[0]?.id
  const endpointWaypoint = draft.waypoints.find((w) => w.id === endpointId)
  const endpointName = endpointWaypoint
    ? placeById(endpointWaypoint.placeId).name
    : '도착지'
  useEffect(() => {
    if (flow.stage !== 'input')
      content.current?.querySelector<HTMLElement>('[tabindex="-1"]')?.focus()
  }, [flow.stage, flow.parkingIndex])
  let points: MapPoint[]
  if (flow.stage === 'parking') {
    const w = draft.waypoints.find(
        (item) => item.id === flow.order[flow.parkingIndex],
      )!,
      place = placeById(w.placeId)
    points = [
      { id: w.id, label: place.name, location: place.location, kind: 'place' },
      ...flow.candidates.map((lot) => ({
        id: lot.id,
        label: lot.name,
        location: lot.location,
        kind: 'parking' as const,
      })),
    ]
  } else {
    // "최종 도착지" 고정이 없다. 방문 순서(order)의 도착지들을 그대로 찍는다.
    // 마지막 항목이 종점이다.
    const order = result?.order ?? draft.waypoints.map((w) => w.id)
    points = [
      {
        id: 'origin',
        label: placeById(draft.originId).name,
        location: placeById(draft.originId).location,
        kind: 'place',
      },
      ...order.map((id) => {
        const w = draft.waypoints.find((item) => item.id === id)!,
          place = placeById(w.placeId)
        return {
          id,
          label: place.name,
          location: place.location,
          kind: 'place' as const,
        }
      }),
    ]
  }
  return (
    <div className="app-shell chalo-shell">
      <header className="topbar">
        <a className="brand" href="#chalo-main" aria-label="차로 홈">
          <span className="brand-icon">
            <Icon name="route" size={23} />
          </span>
          차로<span className="brand-en">chalo</span>
        </a>
        <div className="nav-title">도착까지, 더 나은 방법</div>
        <button
          className="about-button native-button"
          onClick={() => dialog.current?.showModal()}
        >
          <Icon name="info" size={16} />
          이용 안내
        </button>
      </header>
      <main className="workspace" id="chalo-main">
        <Sidebar flow={flow} />
        <section className="results" aria-busy={flow.busy} ref={content}>
          <div className="result-heading">
            <div className="breadcrumbs">
              경로 탐색 <span>/</span>주차 후 이동
            </div>
            <div className="result-title">
              <h2
                tabIndex={-1}
                aria-label={
                  flow.stage === 'results' ? '경로 비교 결과' : undefined
                }
              >
                {endpointName}
                <span>가는 길</span>
              </h2>
              <span className="data-badge">
                {flow.live ? 'API 경로 조회' : '테스트 데이터'}
              </span>
            </div>
            <p>도로 혼잡을 피해, 이동시간과 비용을 함께 비교해보세요.</p>
          </div>
          {flow.stage === 'input' && (
            <div className="dirty-notice">
              <Icon name="info" size={15} />
              장소를 선택한 뒤 ‘더 나은 경로 찾기’를 눌러 조회하세요.
              자동차·대중교통은 실제 API를 사용하며, 접근 도보는 추정값·주차장은
              샘플입니다.
            </div>
          )}
          {flow.error && (
            <div className="error-box" role="alert">
              {flow.error}
              <button className="native-button" onClick={flow.edit}>
                입력으로 돌아가기
              </button>
            </div>
          )}
          <div className="map-container">
            <RouteMap
              key={
                flow.stage === 'parking'
                  ? `parking-${flow.parkingIndex}`
                  : (selected?.scenario ?? 'preview')
              }
              points={points}
              route={selected}
              selected={flow.highlighted}
              onSelect={
                flow.stage === 'parking' && !flow.busy
                  ? flow.setHighlighted
                  : undefined
              }
            />
            <div className="congestion-strip">
              <div className="congestion-icon">
                <Icon name="layers" size={19} />
              </div>
              <div>
                <strong>방문 지역</strong>
                <span>도착 시각 예측 · 추천에 반영</span>
              </div>
              <div className="congestion-tags">
                <span>
                  도로 <b>정보 없음</b>
                </span>
                <span>
                  인구 <b>{selected ? '추천 근거 참고' : '조회 전'}</b>
                </span>
              </div>
            </div>
          </div>
          {flow.stage === 'parking' && <ParkingChoices flow={flow} />}
          {result && selected && (
            <RouteResults
              live={flow.live}
              result={result}
              draft={draft}
              selected={selected}
              selections={flow.selections}
              onSelect={(route) => setScenario(route.scenario)}
            />
          )}
          {flow.stage === 'results' && flow.orders.length > 1 && (
            <div className="order-control">
              <label htmlFor="order-select">방문 순서 변경</label>
              <select
                id="order-select"
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
              <small>순서를 바꾸면 주차장을 처음부터 다시 선택합니다.</small>
            </div>
          )}
        </section>
      </main>
      <dialog
        className="guide-dialog"
        ref={dialog}
        aria-labelledby="guide-title"
      >
        <button
          className="icon-button dialog-close"
          aria-label="이용 안내 닫기"
          onClick={() => dialog.current?.close()}
        >
          <Icon name="close" />
        </button>
        <h2 id="guide-title">차로 이용 안내</h2>
        <p>차를 어디에 두고, 어떻게 이동할지 함께 비교해요.</p>
        <ol>
          <li>출발지와 도착지들을 선택하고 체류시간을 입력하세요.</li>
          <li>추천 방문 순서대로 도착지마다 주차장을 선택하세요.</li>
          <li>자차·혼합·대중교통의 이동시간과 비용을 비교하세요.</li>
        </ol>
        <div className="guide-note">
          <strong>데이터 연결 상태</strong>
          <p>
            자동차는 카카오, 대중교통은 ODsay, 혼잡도는 서울시 API로 조회합니다.
            접근 도보는 추정값이고 주차장은 샘플이며 잔여 주차면은 표시하지
            않습니다. 택시는 현재 MVP에 포함되지 않습니다.
          </p>
        </div>
      </dialog>
    </div>
  )
}
