import { useEffect, useRef, useState } from 'react'
import type { Scenario } from '@shared/types'
import type { JourneyService } from '../services/journey'
import { useJourney } from '../hooks/useJourney'
import { placeById } from '../services/places'
import type { MapPoint } from '../components/CoordinateMap'
import { Sidebar } from './Sidebar'
import { RouteMap } from './RouteMap'
import { ParkingChoices } from './ParkingChoices'
import { RouteResults } from './RouteResults'
import { Icon } from './Icons'
import { usePreview } from './usePreview'
import './source.css'
import './native.css'

export function ChaloApp({ service }: { service?: JourneyService }) {
  const flow = useJourney(service),
    preview = usePreview()
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const dialog = useRef<HTMLDialogElement>(null),
    content = useRef<HTMLElement>(null)
  const draft =
    flow.stage === 'input' ? (preview?.draft ?? flow.draft) : flow.draft
  const result =
    flow.result ?? (flow.stage === 'input' ? preview?.result : null)
  const selected =
    result?.routes.find((r) => r.scenario === scenario) ?? result?.routes[0]
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
      {
        id: 'destination',
        label: placeById(draft.destinationId).name,
        location: placeById(draft.destinationId).location,
        kind: 'place',
      },
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
                {placeById(draft.destinationId).name}
                <span>가는 길</span>
              </h2>
              <span className="data-badge">DEMO · 예시 데이터</span>
            </div>
            <p>도로 혼잡을 피해, 이동시간과 비용을 함께 비교해보세요.</p>
          </div>
          {flow.stage === 'input' && (
            <div className="dirty-notice">
              <Icon name="info" size={15} />
              예시 미리보기입니다. ‘더 나은 경로 찾기’를 눌러 주차장을 선택하고
              결과를 업데이트하세요.
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
                <span>최근 관측 정보</span>
              </div>
              <div className="congestion-tags">
                <span>
                  도로 <b>정보 없음</b>
                </span>
                <span>
                  인구 <b>정보 없음</b>
                </span>
              </div>
            </div>
          </div>
          {flow.stage === 'parking' && <ParkingChoices flow={flow} />}
          {result && selected && (
            <RouteResults
              result={result}
              draft={draft}
              selected={selected}
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
          <li>출발지·도착지와 경유지를 선택하고 체류시간을 입력하세요.</li>
          <li>추천 방문 순서대로 경유지마다 주차장을 선택하세요.</li>
          <li>자차·혼합·대중교통의 이동시간과 비용을 비교하세요.</li>
        </ol>
        <div className="guide-note">
          <strong>현재는 데모 화면입니다.</strong>
          <p>
            주차장과 이동시간은 예시입니다. 실제 API 연결 전이며 잔여 주차면은
            표시하지 않습니다. 택시는 현재 MVP에 포함되지 않습니다.
          </p>
        </div>
      </dialog>
    </div>
  )
}
