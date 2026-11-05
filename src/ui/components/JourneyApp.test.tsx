import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createJourneyService } from '../services/journey'
import { JourneyApp } from './JourneyApp'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const click = (name: string | RegExp) =>
  fireEvent.click(screen.getByRole('button', { name }))

describe('입력 → 주차 → 결과', () => {
  it('도착지 4개째 추가를 막고 키보드로 순서를 바꾼다', () => {
    render(<JourneyApp service={createJourneyService()} />)
    // 기본 도착지 2개 → 1개 추가하면 최대(3개)에 도달해 추가 버튼이 비활성
    click('도착지 추가')
    expect(screen.getByRole('button', { name: '도착지 추가' })).toBeDisabled()
    fireEvent.keyDown(
      screen.getByRole('button', { name: '도착지 2 순서 이동' }),
      { key: 'ArrowUp' },
    )
    expect(screen.getByLabelText('도착지 1 장소')).toHaveTextContent('강남역')
    expect(
      screen.getByRole('button', { name: '자동 순서 추천으로 되돌리기' }),
    ).toBeInTheDocument()
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
    expect(screen.getAllByText(/\d+\.\d \/ 100/)).toHaveLength(2)
    expect(screen.getByLabelText('도착지 1 장소')).toBeEnabled()
    fireEvent.change(screen.getByLabelText('도착지 1 체류시간'), {
      target: { value: '90' },
    })
    expect(
      screen.queryByRole('heading', { name: '경로 비교 결과' }),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('도착지 1 체류시간')).toHaveValue(90)
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
    fireEvent.keyDown(
      screen.getByRole('button', { name: '도착지 2 순서 이동' }),
      { key: 'ArrowUp' },
    )
    expect(screen.queryByLabelText('방문 순서 변경')).not.toBeInTheDocument()
    click('주차장 찾기')
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          documents: [
            {
              place_name: '홍대입구역 카페',
              address_name: '서울 마포구',
              x: '126.923',
              y: '37.557',
            },
          ],
        }),
      }),
    )
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '홍대입구역 카페' },
    })
    fireEvent.click(
      await screen.findByRole('option', { name: /홍대입구역 카페/ }),
    )
    fireEvent.keyDown(
      screen.getByRole('button', { name: '도착지 1 순서 이동' }),
      { key: 'ArrowDown' },
    )
    fireEvent.keyDown(
      screen.getByRole('button', { name: '도착지 2 순서 이동' }),
      { key: 'ArrowUp' },
    )
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          documents: [
            {
              place_name: '홍대입구역 카페',
              address_name: '서울 마포구',
              x: '126.923',
              y: '37.557',
            },
          ],
        }),
      }),
    )
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '홍대입구역 카페' },
    })
    fireEvent.click(
      await screen.findByRole('option', { name: /홍대입구역 카페/ }),
    )
    fireEvent.keyDown(
      screen.getByRole('button', { name: '도착지 1 순서 이동' }),
      { key: 'ArrowDown' },
    )
    fireEvent.keyDown(
      screen.getByRole('button', { name: '도착지 2 순서 이동' }),
      { key: 'ArrowUp' },
    )
    click('주차장 찾기')
    await screen.findByText(/반경 1km 안에 샘플 주차장이 없습니다/)
    expect(
      screen.queryByRole('button', { name: '입력 수정' }),
    ).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('도착지 1 체류시간'), {
      target: { value: '90' },
    })
    await waitFor(() =>
      expect(screen.getByLabelText('도착지 1 장소')).toHaveTextContent(
        '홍대입구역 카페',
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
    fireEvent.change(screen.getByLabelText('도착지 1 체류시간'), {
      target: { value: '90' },
    })
    click('주차장 찾기')
    expect(
      await screen.findByRole('heading', { name: /첫 번째 주차장/ }),
    ).toBeInTheDocument()
  })
})
