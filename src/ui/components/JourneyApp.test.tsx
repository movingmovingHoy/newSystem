import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createJourneyService } from '../services/journey'
import { JourneyApp } from './JourneyApp'

afterEach(cleanup)
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole('button', { name }))

describe('입력 → 주차 → 결과', () => {
  it('경유지 4개째 추가를 막고 고정 순번 중복을 막는다', () => {
    render(<JourneyApp />)
    click('경유지 추가')
    click('경유지 추가')
    expect(screen.getByRole('button', { name: '경유지 추가' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('경유지 1 고정 순번'), {
      target: { value: '0' },
    })
    const second = screen.getByLabelText('경유지 2 고정 순번')
    expect(
      within(second).getByRole('option', { name: '1번째 고정' }),
    ).toBeDisabled()
  })
  it('순차 주차 선택 후 결과와 정보 없음 문구를 보여준다', async () => {
    render(<JourneyApp />)
    click('경유지 추가')
    click('주차장 찾기')
    expect(
      await screen.findByRole('heading', { name: /첫 번째 주차장/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '경로 비교 결과' }),
    ).not.toBeInTheDocument()
    click('이 주차장 선택')
    expect(
      await screen.findByRole('heading', { name: /두 번째 주차장/ }),
    ).toBeInTheDocument()
    click('이 주차장 선택')
    expect(
      await screen.findByRole('heading', { name: '경로 비교 결과' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('주차비 일부 정보 없음').length).toBeGreaterThan(
      0,
    )
    expect(screen.getAllByText('혼잡: 정보 없음').length).toBeGreaterThan(0)
    expect(screen.getByText(/최종 도착/)).toBeInTheDocument()
  })
  it('결과에서 순서를 변경하면 주차 선택을 초기화한다', async () => {
    render(<JourneyApp />)
    click('경유지 추가')
    click('주차장 찾기')
    await screen.findByRole('heading', { name: /첫 번째 주차장/ })
    click('이 주차장 선택')
    await screen.findByRole('heading', { name: /두 번째 주차장/ })
    click('이 주차장 선택')
    await screen.findByRole('heading', { name: '경로 비교 결과' })
    fireEvent.change(screen.getByLabelText('방문 순서 변경'), {
      target: { value: '1' },
    })
    expect(
      await screen.findByRole('heading', { name: /첫 번째 주차장/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: '경로 비교 결과' }),
    ).not.toBeInTheDocument()
    expect(screen.getByText('선택 완료 0 / 2')).toBeInTheDocument()
  })
  it('후보가 없으면 입력으로 돌아가 수정할 수 있다', async () => {
    render(<JourneyApp />)
    fireEvent.click(screen.getByRole('combobox', { name: '경유지 1 장소' }))
    fireEvent.click(screen.getByRole('option', { name: /홍대입구역/ }))
    click('주차장 찾기')
    expect(
      await screen.findByText('반경 1km 안에 샘플 주차장이 없습니다.'),
    ).toBeInTheDocument()
    click('입력 수정')
    await waitFor(() =>
      expect(screen.getByLabelText('경유지 1 장소')).toHaveTextContent('홍대입구역'),
    )
  })
})

describe('복구 및 경유지 없는 경로', () => {
  it('경유지가 없으면 주차 선택을 건너뛴다', async () => {
    render(<JourneyApp />)
    click('경유지 1 삭제')
    click('경로 비교하기')
    expect(
      await screen.findByRole('heading', { name: '경로 비교 결과' }),
    ).toBeInTheDocument()
  })
  it('검색 실패 후 입력을 고쳐 재시도할 수 있다', async () => {
    const service = createJourneyService()
    const realOrder = service.order
    service.order = vi
      .fn()
      .mockRejectedValueOnce(new Error('일시적인 경로 오류'))
      .mockImplementation(realOrder)
    render(<JourneyApp service={service} />)
    click('주차장 찾기')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '일시적인 경로 오류',
    )
    click('입력으로 돌아가기')
    click('주차장 찾기')
    expect(
      await screen.findByRole('heading', { name: /첫 번째 주차장/ }),
    ).toBeInTheDocument()
  })
})
