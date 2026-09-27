import { useEffect, useRef, useState } from 'react'
import { places, placeById } from '../services/places'
import { Icon } from './Icons'
export function PlacePicker({
  value,
  onChange,
  label,
  disabled,
}: {
  value: string
  onChange: (id: string) => void
  label: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState('')
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
              placeholder="서울역, 시청, 강남, 홍대…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <p className="picker-caption">데모에서 선택 가능한 장소</p>
          <div role="listbox" id={`${label}-list`} aria-label={`${label} 목록`}>
            {places
              .filter((p) => p.name.includes(query))
              .map((p) => (
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
                    <small>서울 · 데모 장소</small>
                  </span>
                  {value === p.id && <Icon name="check" size={15} />}
                </button>
              ))}
          </div>
          {!places.some((p) => p.name.includes(query)) && (
            <p className="picker-caption">검색 결과가 없습니다.</p>
          )}
        </div>
      )}
    </div>
  )
}
