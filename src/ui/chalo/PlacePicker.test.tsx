import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlacePicker } from './PlacePicker'
import { placeById } from '../services/catalog'
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const tick = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350)
  })
}
describe('장소 자동완성', () => {
  it('2글자부터 디바운스하고 API 결과의 실제 좌표를 선택한다', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        documents: [
          {
            place_name: '광화문 카페',
            road_address_name: '서울 종로구',
            x: '126.977',
            y: '37.57',
          },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetch)
    const pick = vi.fn()
    render(
      <PlacePicker
        value="station"
        kind="origin"
        label="출발지"
        onChange={pick}
      />,
    )
    fireEvent.click(screen.getByRole('combobox'))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '광' } })
    await tick()
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '광ㅎ' } })
    expect(
      screen.getAllByRole('option', { name: /광화문/ }).length,
    ).toBeGreaterThan(0)
    expect(fetch).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '광화문' } })
    await tick()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(fetch.mock.calls[0][0])).toContain('/api/kakao/dapi/')
    fireEvent.click(screen.getByRole('option', { name: /광화문 카페/ }))
    expect(placeById(pick.mock.calls[0][0]).location).toEqual({
      lat: 37.57,
      lng: 126.977,
    })
  })
  it('도착지는 121곳을 표시하고 API를 호출하지 않는다', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    render(<PlacePicker value="gangnam" label="도착지" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('combobox'))
    expect(screen.getAllByRole('option')).toHaveLength(121)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '광ㅎ' } })
    expect(
      screen.getAllByRole('option', { name: /광화문/ }).length,
    ).toBeGreaterThan(0)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('늦게 도착한 이전 검색 응답이 최신 결과를 덮어쓰지 않는다', async () => {
    vi.useFakeTimers()
    let resolveOld!: (value: unknown) => void
    const response = (name: string) => ({
      ok: true,
      json: async () => ({
        documents: [{ place_name: name, x: '127', y: '37.5' }],
      }),
    })
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveOld = resolve
            }),
        )
        .mockResolvedValueOnce(response('최신 장소')),
    )
    render(
      <PlacePicker
        value="station"
        kind="origin"
        label="출발지"
        onChange={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '이전' } })
    await tick()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '최신' } })
    await tick()
    await act(async () => {
      resolveOld(response('이전 장소'))
    })
    expect(
      screen.getByRole('option', { name: /최신 장소/ }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('option', { name: /이전 장소/ }),
    ).not.toBeInTheDocument()
  })
  it('API 실패를 표시하며 데모 장소로 대체하지 않는다', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('401')))
    render(
      <PlacePicker
        value="station"
        kind="origin"
        label="출발지"
        onChange={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: '없는장소' },
    })
    await tick()
    expect(screen.getByRole('alert')).toHaveTextContent('카카오 검색에 실패')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})
