import { PARKING_RADIUS_M } from './constants'
import { CONGEST_LEVELS } from './scoring'

/**
 * 목적지 주차 압박 (park-transit 추천 근거). AGENTS.md 8-2. 전부 튜닝 대상.
 * 압박점수 = 인근 주차 포화율(0~100) + 목적지 혼잡도 가산(0~PARKING_PRESSURE_CONGESTION_MAX).
 */

/** 목적지 주변 포화율을 집계하는 반경(m). 주차장 후보 반경과 같은 값을 쓴다. */
export const PARKING_PRESSURE_RADIUS_M = PARKING_RADIUS_M

/** 압박점수가 이 값 이상이면 "주차 후 대중교통"을 추천 근거로 든다. */
export const PARKING_PRESSURE_THRESHOLD = 70

/** 혼잡도 가산 최대점. 혼잡 단계 0~최대 단계를 0~이 값으로 선형 환산한다. */
export const PARKING_PRESSURE_CONGESTION_MAX = 20

/** 혼잡도 가산에 쓰는 최대 혼잡 단계 인덱스 (붐빔 = 3). */
export const PARKING_PRESSURE_MAX_LEVEL = CONGEST_LEVELS.length - 1

/** 첫 도착지(차를 세울 곳) 인근 포화율이 이 값 이상이면 추천에서 제외한다. */
export const PARKING_FULL_RATIO = 0.8

/** 실시간 주차 값은 "지금"뿐이라, 출발이 지금보다 이 분 수 넘게 뒤면 정보 없음으로 본다. */
export const REALTIME_PARKING_MAX_DELAY_MIN = 60

/** 실시간 주차 값의 갱신 시각이 이 분 수보다 오래되면 정보 없음으로 본다. */
export const REALTIME_PARKING_MAX_AGE_MIN = 30

/**
 * 반경 내 실시간 주차장의 합계 주차면이 이 값 미만이면 대표성이 없어 정보 없음으로 본다.
 * 작은 공영주차장 한 곳(예: 11면)의 포화율로 주변 전체를 판단하지 않기 위함이다.
 */
export const REALTIME_PARKING_MIN_CAPACITY = 100
