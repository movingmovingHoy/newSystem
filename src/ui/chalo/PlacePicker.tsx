import { useEffect, useRef, useState } from 'react'
import { placeById } from '../services/catalog'
import { usePlaceSearch } from '../hooks/usePlaceSearch'
import { Icon } from './Icons'
export function PlacePicker({
  value,
  onChange,
  label,
  disabled,
  kind = 'area',
}: {
  value: string
  onChange: (id: string) => void
  label: string
  disabled?: boolean
  kind?: 'origin' | 'area'
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState('')
  const { results, loading, error } = usePlaceSearch(query, kind, open)
  const root = useRef<HTMLDivElement>(null)
  // 키보드로 이동 중인 후보의 인덱스. -1 은 아직 아무것도 강조하지 않은 상태.
  const [activeIndex, setActiveIndex] = useState(-1)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  // 팝오버를 새로 열거나 검색 결과가 바뀌면 강조 위치를 첫 번째 후보로 되돌린다.
  useEffect(() => {
    setActiveIndex(results.length ? 0 : -1)
  }, [results, open])
  const select = (id: string) => {
    onChange(id)
    setOpen(false)
  }
  return (
    <div
      className="picker-root"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
    >
      <button
        type="button"
        className="place-picker native-button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? `${label}-list` : undefined}
        disabled={disabled}
        onClick={() => {
          setQuery('')
          setOpen(!open)
        }}
      >
        <span>{placeById(value).name}</span>
        <Icon name="search" size={16} />
      </button>
      {open && (
        <div className="place-popover">
          <div className="picker-search">
            <Icon name="search" size={16} />
            <input
              autoFocus
              aria-label={`${label} 검색`}
              placeholder={
                kind === 'origin'
                  ? '장소명 두 글자 이상 입력'
                  : '서울 121곳 검색 · 광ㅎ, ㄱㅎㅁ'
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter 로 강조된 후보를 선택한다. 폼(사이드바) 안에 있으므로
                // preventDefault 로 암묵적 submit(=경로찾기 실행)을 막는다.
                // 이걸 막지 않으면 팝오버가 열린 채 busy 상태가 되어 화면 전체가
                // 먹통처럼 보이던 버그가 재현된다.
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const pick = results[activeIndex] ?? results[0]
                  if (pick) select(pick.id)
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActiveIndex((i) =>
                    results.length ? (i + 1) % results.length : -1,
                  )
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActiveIndex((i) =>
                    results.length
                      ? (i - 1 + results.length) % results.length
                      : -1,
                  )
                }
              }}
            />
          </div>
          <p className="picker-caption">
            {kind === 'origin'
              ? '카카오 장소검색 · 서울 121곳 추천'
              : '서울시 주요 121곳'}
          </p>
          {error && <p role="alert">{error}</p>}
          <div role="listbox" id={`${label}-list`} aria-label={`${label} 목록`}>
            {results.map((p, index) => (
              <button
                type="button"
                role="option"
                aria-selected={p.id === value}
                data-active={index === activeIndex ? '' : undefined}
                key={p.id}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(p.id)}
              >
                <Icon name="pin" size={16} />
                <span>
                  {p.name}
                  <small>
                    {p.areaCode ? `서울 121곳 · ${p.address}` : p.address}
                  </small>
                </span>
                {value === p.id && <Icon name="check" size={15} />}
              </button>
            ))}
          </div>
          {!loading && !error && !results.length && (
            <p className="picker-caption">
              {kind === 'origin' && query.trim().length < 2
                ? '두 글자 이상 입력해주세요.'
                : '검색 결과가 없습니다.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
