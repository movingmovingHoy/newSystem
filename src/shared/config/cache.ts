/**
 * 캐시 규칙. AGENTS.md 14장.
 * TTL: 자차 10~30분 / 대중교통 수 시간 / 혼잡도 30분 / 주차장 정보는 DB.
 * 좌표는 소수점 자릿수로 반올림, 시간은 30분 버킷으로 키를 만든다.
 */
export const CACHE_TTL_SEC = {
  carRoute: 20 * 60,
  transitRoute: 3 * 60 * 60,
  walkRoute: 60 * 60,
  congestion: 30 * 60,
} as const

/** 경로 키 좌표 반올림 자릿수 (소수점) */
export const ROUTE_KEY_COORD_DECIMALS = 4
/** 경로 키 시간 버킷 (분) */
export const ROUTE_KEY_TIME_BUCKET_MIN = 30
