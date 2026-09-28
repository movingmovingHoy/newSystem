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
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
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
            />
          </div>
          <p className="picker-caption">
            {kind === 'origin'
              ? '카카오 장소검색 · 서울 121곳 추천'
              : '서울시 주요 121곳'}
          </p>
          {loading && <p role="status">장소 검색 중…</p>}
          {error && <p role="alert">{error}</p>}
          <div role="listbox" id={`${label}-list`} aria-label={`${label} 목록`}>
            {results.map((p) => (
              <button
                type="button"
                role="option"
                aria-selected={p.id === value}
                key={p.id}
                onClick={() => {
                  onChange(p.id)
                  setOpen(false)
                }}
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
