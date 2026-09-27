import type { CSSProperties } from 'react'
type IconName =
  | 'route'
  | 'car'
  | 'train'
  | 'walk'
  | 'pin'
  | 'info'
  | 'plus'
  | 'close'
  | 'search'
  | 'check'
  | 'arrow'
  | 'layers'
  | 'wallet'
  | 'clock'
  | 'parking'
  | 'reset'
const shapes: Record<IconName, React.ReactNode> = {
  route: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M9 6h8a4 4 0 0 1 0 8H7a4 4 0 0 0 0 8" />
    </>
  ),
  car: (
    <>
      <path d="m5 8 2-5h10l2 5M3 9h18v9H3zM5 18v3m14-3v3M6 13h2m8 0h2" />
    </>
  ),
  train: (
    <>
      <rect x="5" y="3" width="14" height="15" rx="4" />
      <path d="M5 10h14M9 3v7m6-7v7M8 18l-3 4m11-4 3 4M8 14h1m6 0h1" />
    </>
  ),
  walk: (
    <>
      <ellipse cx="7" cy="8" rx="3" ry="5" transform="rotate(-20 7 8)" />
      <ellipse cx="17" cy="15" rx="3" ry="5" transform="rotate(20 17 15)" />
      <path d="m6 17 2 3m8-16 2 3" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10v1" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  layers: (
    <>
      <path d="m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 17l10 5 10-5" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <path d="M3 7V4l14-2v3M21 11h-6v5h6m-4-3h1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  parking: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 18V6h3a3 3 0 0 1 0 6h-3" />
    </>
  ),
  reset: (
    <>
      <path d="M3 9a9 9 0 1 1 0 6M3 3v6h6" />
    </>
  ),
}
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: IconName
  size?: number
  style?: CSSProperties
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {shapes[name]}
    </svg>
  )
}
