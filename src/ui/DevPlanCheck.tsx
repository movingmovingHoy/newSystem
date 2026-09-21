/**
 * ⚠️ 임시 확인용 컴포넌트 (A 담당). planRoutes 전체 흐름을 실제 API로 눈으로 확인한다.
 *   장소검색(출발지) + 121곳 선택(도착지/경유지) → 순서 최적화 → 시나리오 3종
 *   → 타임라인 → 점수/근거 → 혼잡도.
 * B 담당 정식 UI가 붙으면 이 파일과 App.tsx 사용처를 삭제한다.
 *
 * 주차장 선택은 아직 없으므로(=B 담당), 경유지 근처에 임시 주차 좌표를 만들어 넣는다.
 */
import { useState } from 'react'
import type { LatLng, Route, Waypoint } from '@shared/types'
import type { Preference } from '@shared/config'
import { planRoutes, type PlanWaypoint } from '@features/routing'
import {
  KakaoCarProvider,
  KakaoWalkProvider,
  KakaoTransitProvider,
  MockWalkProvider,
  MockTransitProvider,
  searchPlaces,
  type PlaceResult,
} from '@features/routing/providers'
import {
  CongestionService,
  SeoulCongestionProvider,
  searchAreas,
  type AreaInfo,
} from '@features/congestion'

type Picked = { label: string; location: LatLng }

type WpForm = {
  area: AreaInfo | null
  dwellMin: string
  fixedIndex: string
}

const box: React.CSSProperties = {
  padding: 'var(--space-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
}

/** 출발지: 카카오 로컬 장소검색 */
function PlaceSearch({
  value,
  onPick,
}: {
  value: Picked | null
  onPick: (p: Picked) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const search = async () => {
    setBusy(true)
    setErr(null)
    try {
      setResults(await searchPlaces(q))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        <input
          placeholder="출발지 검색 (예: 서울시청)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
          style={{ flex: 1 }}
        />
        <button onClick={search} disabled={busy}>
          {busy ? '...' : '검색'}
        </button>
      </div>
      {err && <span style={{ color: 'var(--color-danger)' }}>{err}</span>}
      {value && <span>선택: {value.label}</span>}
      {results.map((r, i) => (
        <button
          key={i}
          onClick={() => onPick({ label: r.name, location: r.location })}
          style={{ textAlign: 'left' }}
        >
          {r.name} <small>{r.address}</small>
        </button>
      ))}
    </div>
  )
}

/** 도착지/경유지: 121곳 검색·선택 */
function AreaSearch({
  value,
  onPick,
}: {
  value: AreaInfo | null
  onPick: (a: AreaInfo) => void
}) {
  const [q, setQ] = useState('')
  const results = searchAreas(q).slice(0, 8)
  return (
    <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <input
        placeholder="121곳 검색 (예: 강남, 홍대)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {value && <span>선택: {value.areaName}</span>}
      {results.map((a) => (
        <button
          key={a.areaCode}
          onClick={() => onPick(a)}
          style={{ textAlign: 'left' }}
        >
          {a.areaName} <small>{a.category}</small>
        </button>
      ))}
    </div>
  )
}

export function DevPlanCheck() {
  const [origin, setOrigin] = useState<Picked | null>(null)
  const [dest, setDest] = useState<AreaInfo | null>(null)
  // 기본 출발 시각 = 지금(로컬). 서울 도시데이터 예측은 현재~향후 12시간만 있으므로
  // 미래 날짜를 넣으면 혼잡이 "정보 없음"이 된다.
  const [departAt, setDepartAt] = useState(() => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`
  })
  const [preference, setPreference] = useState<Preference>('time')
  const [useCongestion, setUseCongestion] = useState(true)
  // 도보/대중교통은 유료 API라 기본은 mock. 승인 후 실물로 켜서 확인.
  const [mockWalkTransit, setMockWalkTransit] = useState(true)
  const [waypoints, setWaypoints] = useState<WpForm[]>([])

  const [order, setOrder] = useState<string[] | null>(null)
  const [routes, setRoutes] = useState<Route[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const addWp = () => {
    if (waypoints.length >= 3) return
    setWaypoints([...waypoints, { area: null, dwellMin: '60', fixedIndex: '' }])
  }
  const removeWp = (i: number) =>
    setWaypoints(waypoints.filter((_, idx) => idx !== i))
  const updateWp = (i: number, patch: Partial<WpForm>) =>
    setWaypoints(
      waypoints.map((w, idx) => (idx === i ? { ...w, ...patch } : w)),
    )

  const run = async () => {
    setLoading(true)
    setError(null)
    setRoutes(null)
    setOrder(null)
    try {
      if (!origin) throw new Error('출발지를 검색해서 선택하세요')
      if (!dest) throw new Error('도착지(121곳)를 선택하세요')

      const providers = {
        car: new KakaoCarProvider(),
        walk: mockWalkTransit
          ? new MockWalkProvider()
          : new KakaoWalkProvider(),
        transit: mockWalkTransit
          ? new MockTransitProvider()
          : new KakaoTransitProvider(),
      }

      const planWps: PlanWaypoint[] = waypoints
        .filter((w) => w.area)
        .map((w, i) => {
          const a = w.area!
          const waypoint: Waypoint = {
            id: a.areaName,
            location: a.center,
            dwellMin: Number(w.dwellMin) || 60,
            ...(w.fixedIndex !== ''
              ? { fixedIndex: Number(w.fixedIndex) }
              : {}),
          }
          return {
            waypoint,
            parkingLotId: `tmp-lot-${i + 1}`,
            parkingLocation: {
              lat: a.center.lat + 0.0008,
              lng: a.center.lng + 0.0008,
            },
            parkingFee: 2000,
          }
        })

      // 목록에서 고른 지점은 areaCode를 이미 아니 좌표 재매칭 없이 직접 조회한다.
      const areaByKey = new Map<string, string>()
      const key = (l: LatLng) => `${l.lat},${l.lng}`
      areaByKey.set(key(dest.center), dest.areaCode)
      for (const w of waypoints) {
        if (w.area) areaByKey.set(key(w.area.center), w.area.areaCode)
      }

      let congestionLevelAt:
        ((loc: LatLng, arriveAt: Date) => Promise<number | null>) | undefined
      if (useCongestion) {
        const svc = new CongestionService(new SeoulCongestionProvider())
        congestionLevelAt = async (loc, arriveAt) => {
          const code = areaByKey.get(key(loc))
          const r = code
            ? await svc.getCongestionByArea(code, arriveAt)
            : await svc.getCongestion(loc, arriveAt)
          return r.level
        }
      }

      const result = await planRoutes(providers, {
        origin: origin.location,
        destination: dest.center,
        waypoints: planWps,
        departAt: new Date(departAt).toISOString(),
        preference,
        congestionLevelAt,
      })
      setOrder(result.order)
      setRoutes(result.routes)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const min = (sec: number) => `${Math.round(sec / 60)}분`
  const won = (n: number) => `${n.toLocaleString()}원`
  const hhmm = (iso: string) =>
    new Date(iso).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <section
      style={{
        marginTop: 'var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        maxWidth: 600,
      }}
    >
      <strong>임시: A 담당 경로 플래너 확인</strong>

      <div>출발지 (장소검색)</div>
      <PlaceSearch value={origin} onPick={setOrigin} />

      <div>도착지 (서울 121곳)</div>
      <AreaSearch value={dest} onPick={setDest} />

      <label>
        출발 시각{' '}
        <input
          type="datetime-local"
          value={departAt}
          onChange={(e) => setDepartAt(e.target.value)}
          style={box}
        />
      </label>

      <label>
        성향{' '}
        <select
          value={preference}
          onChange={(e) => setPreference(e.target.value as Preference)}
          style={box}
        >
          <option value="time">시간 우선</option>
          <option value="cost">비용 우선</option>
          <option value="lowStamina">체력 약함</option>
        </select>
      </label>

      <label>
        <input
          type="checkbox"
          checked={useCongestion}
          onChange={(e) => setUseCongestion(e.target.checked)}
        />{' '}
        혼잡도 반영 (서울 도시데이터 호출)
      </label>

      <label>
        <input
          type="checkbox"
          checked={mockWalkTransit}
          onChange={(e) => setMockWalkTransit(e.target.checked)}
        />{' '}
        도보/대중교통 mock 사용 (유료 API 미승인 시 켜기)
      </label>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <div>
          경유지 ({waypoints.length}/3, 121곳){' '}
          <button onClick={addWp} disabled={waypoints.length >= 3}>
            + 추가
          </button>
        </div>
        {waypoints.map((w, i) => (
          <div
            key={i}
            style={{ ...box, display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            <AreaSearch
              value={w.area}
              onPick={(a) => updateWp(i, { area: a })}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <label>
                체류(분){' '}
                <input
                  value={w.dwellMin}
                  onChange={(e) => updateWp(i, { dwellMin: e.target.value })}
                  style={{ width: 60 }}
                />
              </label>
              <label>
                고정순번{' '}
                <select
                  value={w.fixedIndex}
                  onChange={(e) => updateWp(i, { fixedIndex: e.target.value })}
                >
                  <option value="">유동</option>
                  <option value="0">0</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </label>
              <button onClick={() => removeWp(i)}>삭제</button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={run}
        disabled={loading}
        style={{
          padding: 'var(--space-2) var(--space-4)',
          background: 'var(--color-primary)',
          color: 'var(--color-primary-contrast)',
          border: 'none',
          borderRadius: 'var(--radius-sm)',
          cursor: 'pointer',
        }}
      >
        {loading ? '계산 중...' : '경로 계산'}
      </button>

      {error && <p style={{ color: 'var(--color-danger)' }}>에러: {error}</p>}

      {order && (
        <p>
          <strong>확정 순서:</strong>{' '}
          {order.length ? order.join(' → ') : '(경유지 없음)'}
        </p>
      )}
      {routes && (
        <p style={{ color: 'var(--color-text-muted)' }}>
          점수는 낮을수록 좋음 (시간+비용+피로도+혼잡감점). 1위가 가장 좋은
          경로.
        </p>
      )}

      {routes?.map((r, i) => (
        <div key={i} style={{ ...box, background: 'var(--color-surface)' }}>
          <div style={{ fontWeight: 600 }}>
            {i + 1}위 · {r.scenario} · 점수 {r.score.toFixed(1)}
          </div>
          <div>
            총 {min(r.totals.durationSec)} · {won(r.totals.cost)} · 도보{' '}
            {r.totals.walkDistanceM}m · 환승 {r.totals.transfers}
            {r.totals.parkingCostPartial ? ' · 주차비 일부 정보 없음' : ''}
          </div>
          {r.stops.length > 0 && (
            <ul style={{ margin: 'var(--space-1) 0' }}>
              {r.stops.map((s, j) => (
                <li key={j}>
                  {s.waypointId}: {hhmm(s.arriveAt)} 도착 → {hhmm(s.departAt)}{' '}
                  출발 · 접근 {s.accessMode ?? '-'} · 혼잡{' '}
                  {s.congestion.level ?? '정보 없음'}
                </li>
              ))}
            </ul>
          )}
          <div style={{ color: 'var(--color-text-muted)' }}>
            {r.reasons.join(' / ')}
          </div>
        </div>
      ))}
    </section>
  )
}
