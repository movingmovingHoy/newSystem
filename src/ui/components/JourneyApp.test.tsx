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
  it('도착지 4개째 추가를 막고 고정 순번 중복을 막는다', () => {
    render(<JourneyApp service={createJourneyService()} />)
    // 기본 도착지 2개 → 1개 추가하면 최대(3개)에 도달해 추가 버튼이 비활성
    click('도착지 추가')
    expect(screen.getByRole('button', { name: '도착지 추가' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('도착지 1 고정 순번'), {
      target: { value: '0' },
    })
    const second = screen.getByLabelText('도착지 2 고정 순번')
    expect(
      within(second).getByRole('option', { name: '1번째 고정' }),
    ).toBeDisabled()
  })
  it('순차 주차 선택 후 결과와 정보 없음 문구를 보여준다', async () => {
    render(<JourneyApp service={createJourneyService()} />)
    // 기본 2개 + 1개 = 도착지 3개 → 종점 제외 2곳 주차 선택
    click('도착지 추가')
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
    expect(screen.getByText(/최종 도착 ·/)).toBeInTheDocument()
  })
  it('결과에서 순서를 변경하면 주차 선택을 초기화한다', async () => {
    render(<JourneyApp service={createJourneyService()} />)
    // 도착지 3개 → 종점 제외 2곳 주차
    click('도착지 추가')
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
  it('후보가 없으면 주차장 없이 진행하거나 입력으로 돌아갈 수 있다', async () => {
    render(<JourneyApp service={createJourneyService()} />)
    // 도착지 1을 홍대(주차장 없음)로 바꾸고 0번째로 고정해 종점이 아니게 만든다
    // → 홍대에 대해 주차 단계가 열리고 후보가 없음을 확인한다.
    fireEvent.click(screen.getByRole('combobox', { name: '도착지 1 장소' }))
    fireEvent.click(screen.getByRole('option', { name: /홍대 관광특구/ }))
    fireEvent.change(screen.getByLabelText('도착지 1 고정 순번'), {
      target: { value: '0' },
    })
    click('주차장 찾기')
    expect(
      await screen.findByText(/반경 1km 안에 샘플 주차장이 없습니다/),
    ).toBeInTheDocument()
    // A-1: 주차장 없이 진행 → 결과 화면까지 도달한다
    click('주차장 없이 이 도착지 진행')
    expect(
      await screen.findByRole('heading', { name: '경로 비교 결과' }),
    ).toBeInTheDocument()
  })
  it('후보가 없을 때 입력으로 돌아가 수정할 수 있다', async () => {
    render(<JourneyApp service={createJourneyService()} />)
    fireEvent.click(screen.getByRole('combobox', { name: '도착지 1 장소' }))
    fireEvent.click(screen.getByRole('option', { name: /홍대 관광특구/ }))
    fireEvent.change(screen.getByLabelText('도착지 1 고정 순번'), {
      target: { value: '0' },
    })
    click('주차장 찾기')
    await screen.findByText(/반경 1km 안에 샘플 주차장이 없습니다/)
    click('입력 수정')
    await waitFor(() =>
      expect(screen.getByLabelText('도착지 1 장소')).toHaveTextContent(
        '홍대 관광특구',
      ),
    )
  })
})

describe('복구 및 단일 도착지 경로', () => {
  it('도착지가 1개면 주차 선택을 건너뛴다', async () => {
    render(<JourneyApp service={createJourneyService()} />)
    // 기본 2개 중 하나를 지워 도착지 1개(=종점)만 남기면 주차 없이 결과로 간다
    click('도착지 2 삭제')
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
