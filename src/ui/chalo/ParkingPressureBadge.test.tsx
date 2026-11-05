import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ParkingPressureView } from '../services/display'
import { ParkingPressureBadge } from './ParkingPressureBadge'

afterEach(cleanup)

const view = (
  over: Partial<ParkingPressureView> = {},
): ParkingPressureView => ({
  percent: 91,
  score: 91,
  recommended: true,
  level: 'high',
  firstPercent: null,
  firstUnknown: false,
  ...over,
})

describe('ParkingPressureBadge', () => {
  it('포화율을 큰 숫자와 미터로 보여준다', () => {
    render(<ParkingPressureBadge view={view()} size="detail" />)
    expect(screen.getByText('91')).toBeInTheDocument()
    const meter = screen.getByRole('meter', { name: '목적지 주변 주차 포화율' })
    expect(meter).toHaveAttribute('aria-valuenow', '91')
  })

  it('추천이면 추천 문구, 아니면 여유 문구를 보여준다', () => {
    const { rerender } = render(
      <ParkingPressureBadge view={view()} size="card" />,
    )
    expect(screen.getByText('주차 후 대중교통 추천')).toBeInTheDocument()
    rerender(
      <ParkingPressureBadge
        view={view({ percent: 40, recommended: false, level: 'low' })}
        size="card"
      />,
    )
    expect(screen.getByText('주차 여유')).toBeInTheDocument()
  })

  it('첫 도착지도 포화면 추천 제외 사유를 보여준다', () => {
    render(
      <ParkingPressureBadge
        view={view({ recommended: false, firstPercent: 85 })}
        size="detail"
      />,
    )
    expect(screen.getByText('추천 제외 · 첫 도착지도 포화')).toBeInTheDocument()
    expect(screen.getByText(/첫 도착지 주변 포화 85%/)).toBeInTheDocument()
  })

  it('상세 크기에서만 첫 도착지 정보와 압박점수를 보여준다', () => {
    const { rerender } = render(
      <ParkingPressureBadge
        view={view({ firstUnknown: true })}
        size="detail"
      />,
    )
    expect(
      screen.getByText(/첫 도착지 주변 주차 정보 없음/),
    ).toBeInTheDocument()
    const detail = screen.getByText(/주차 혼잡 점수 91점/)
    expect(detail).toBeInTheDocument()
    // 기준만 알려주고 구성(포화율 + 혼잡 가산)은 드러내지 않는다
    expect(detail.textContent).toContain('70점 이상이면 추천')
    expect(detail.textContent).not.toContain('가산')
    expect(detail.textContent).not.toContain('압박')
    rerender(
      <ParkingPressureBadge view={view({ firstUnknown: true })} size="card" />,
    )
    expect(screen.queryByText(/주차 혼잡 점수/)).not.toBeInTheDocument()
  })

  it('포화율 수준을 data-level 로 노출한다 (색은 CSS 토큰이 정한다)', () => {
    const { container } = render(
      <ParkingPressureBadge view={view({ level: 'mid' })} size="card" />,
    )
    expect(container.querySelector('[data-level="mid"]')).not.toBeNull()
  })
})
