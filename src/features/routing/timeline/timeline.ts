/**
 * 타임라인 계산. AGENTS.md 7장 5단계.
 * 출발 시각부터 구간 이동시간과 경유지 체류시간을 누적해
 * 경유지별 도착/출발 시각과 최종 도착 시각을 만든다.
 *
 * 구간 수 = 경유지 수 + 1
 */

export type TimelineInput = {
  /** 출발 시각 (ISO 8601) */
  departAt: string
  /** 순서대로 각 구간의 이동시간(초). 길이는 경유지 수 + 1 */
  legDurationsSec: number[]
  /** 경유지별 체류시간(분). 길이는 경유지 수 */
  dwellMinutes: number[]
}

export type TimelineStop = {
  /** 경유지 도착 시각 (ISO) */
  arriveAt: string
  /** 체류 후 출발 시각 (ISO) */
  departAt: string
}

export type TimelineResult = {
  stops: TimelineStop[]
  /** 최종 도착지 도착 시각 (ISO) */
  finalArriveAt: string
}

function addSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString()
}

export function buildTimeline(input: TimelineInput): TimelineResult {
  const { departAt, legDurationsSec, dwellMinutes } = input

  if (legDurationsSec.length !== dwellMinutes.length + 1) {
    throw new Error(
      `구간 수(${legDurationsSec.length})는 경유지 수(${dwellMinutes.length}) + 1 이어야 합니다`,
    )
  }

  const stops: TimelineStop[] = []
  // 현재 "출발" 시각. 각 구간을 이동한 뒤 갱신된다.
  let cursor = departAt

  for (let i = 0; i < dwellMinutes.length; i++) {
    const arriveAt = addSeconds(cursor, legDurationsSec[i])
    const departFromStop = addSeconds(arriveAt, dwellMinutes[i] * 60)
    stops.push({ arriveAt, departAt: departFromStop })
    cursor = departFromStop
  }

  // 마지막 구간: 마지막 경유지(또는 출발지) → 도착지
  const finalArriveAt = addSeconds(cursor, legDurationsSec[legDurationsSec.length - 1])

  return { stops, finalArriveAt }
}
