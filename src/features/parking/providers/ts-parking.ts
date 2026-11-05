/** 서버 전용. 최신 20261001 명세의 Parking_v1 사용. 브라우저 barrel에 export 금지. */
import { normalizeTsParkingRows } from './ts-parking-normalize'
export type TsParkingOptions = {
  fetcher?: typeof fetch
  pageSize?: number
  maxPages?: number
  /** 서울 시군구 코드. 생략하면 서울 전체. 일부 지역 수집 시 별도 DB를 사용한다. */
  sigunguCd?: string
}
export async function fetchTsParkingSnapshot(
  key: string,
  options: TsParkingOptions = {},
) {
  if (!key.trim())
    throw new Error('공단 주차정보 인증키 TS_PARKING_SERVICE_KEY가 필요합니다.')
  const {
    fetcher = fetch,
    pageSize = 9999,
    maxPages = 300,
    sigunguCd,
  } = options
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 9999 ||
    !Number.isInteger(maxPages) ||
    maxPages < 1 ||
    maxPages > 1000
  )
    throw new RangeError('잘못된 페이지 조회 한도입니다.')
  if (sigunguCd !== undefined && !/^11\d{3}$/.test(sigunguCd))
    throw new RangeError('서울 시군구 코드가 필요합니다.')
  async function collect(field: 'PrkSttusInfo' | 'PrkOprInfo') {
    const rows: unknown[] = []
    let total: number | undefined
    let verifyEnd = false
    for (let pageNo = 1; pageNo <= maxPages + 1; pageNo++) {
      if (pageNo > maxPages && !verifyEnd) break
      const params = new URLSearchParams({
        serviceKey: key.trim(),
        pageNo: String(pageNo),
        numOfRows: String(pageSize),
        format: '2',
        sidoCd: '11',
      })
      if (sigunguCd) params.set('sigunguCd', sigunguCd)
      let response: Response | undefined
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await fetcher(
            `https://apis.data.go.kr/B553881/Parking_v1/${field}_v1?${params}`,
            { signal: AbortSignal.timeout(60000) },
          )
          if (response.status < 500 || attempt === 2) break
          await response.body?.cancel()
        } catch {
          response = undefined
        }
      }
      if (!response)
        throw new Error('공단 주차정보 통신 실패. 기존 데이터를 유지합니다.')
      if (!response.ok) throw new Error(`공단 주차정보 HTTP ${response.status}`)
      let data: Record<string, unknown>
      try {
        const parsed: unknown = await response.json()
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new Error()
        data = parsed as Record<string, unknown>
      } catch {
        throw new Error('공단 주차정보 응답 형식 오류')
      }
      if (!['0', '00'].includes(String(data?.resultCode)))
        throw new Error(
          '공단 주차정보 조회 실패. 인증 및 서비스 상태를 확인해주세요.',
        )
      const rawCount = data.totalCount
      const count =
        typeof rawCount === 'number' ||
        (typeof rawCount === 'string' && rawCount.trim() !== '')
          ? Number(rawCount)
          : NaN
      if (
        !Number.isSafeInteger(count) ||
        count < 0 ||
        count > pageSize * maxPages
      )
        throw new Error(
          '공단 주차정보 총건수가 조회 한도를 초과하거나 잘못되었습니다.',
        )
      if (total !== undefined && total !== count)
        throw new Error('공단 주차정보 조회 중 총건수가 변경되었습니다.')
      total = count
      const page = data[field] ?? (count === 0 ? [] : undefined)
      if (!Array.isArray(page) || Number(data.pageNo) !== pageNo)
        throw new Error('공단 주차정보 페이지가 불완전합니다.')
      if (verifyEnd) {
        if (page.length !== 0)
          throw new Error('공단 주차정보 페이지가 불완전합니다.')
        return { rows, declaredCount: count }
      }
      const expected = Math.min(pageSize, count - rows.length)
      if (page.length !== expected) {
        // 실제 API 시설정보는 totalCount보다 적을 수 있다. 중간 누락은 허용하지
        // 않고, 마지막 페이지에만 다음 페이지가 비었는지 추가 확인한다.
        if (
          pageNo !== Math.ceil(count / pageSize) ||
          page.length === 0 ||
          page.length > expected
        )
          throw new Error('공단 주차정보 페이지가 불완전합니다.')
        verifyEnd = true
      }
      rows.push(...page)
      if (rows.length === count) return { rows, declaredCount: count }
    }
    throw new Error('공단 주차정보 페이지 조회 한도 초과')
  }
  const facilities = await collect('PrkSttusInfo')
  if (!facilities.rows.length)
    throw new Error('공단 시설정보가 없어 기존 데이터를 교체할 수 없습니다.')
  const operations = await collect('PrkOprInfo')
  const result = normalizeTsParkingRows(facilities.rows, operations.rows)
  if (!result.snapshot.facilities.length)
    throw new Error('유효한 서울 주차장 시설정보가 없습니다.')
  return {
    ...result,
    declaredFacilityRows: facilities.declaredCount,
    declaredOperationRows: operations.declaredCount,
  }
}
