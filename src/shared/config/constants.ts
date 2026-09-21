/**
 * 상수. AGENTS.md 5장에 나열된 기본값. 여기서만 정의하고 코드에 하드코딩 금지.
 */
export const MAX_WAYPOINTS = 3
export const MAX_PARKING_CANDIDATES = 3
/** 경유지 반경 주차장 검색 반경 (m) */
export const PARKING_RADIUS_M = 1000
/** 이 거리 이하면 도보만 계산하고 대중교통 계산 생략 (AGENTS.md 8장) */
export const WALK_ONLY_THRESHOLD_M = 400
/** 경유지 기본 체류시간 (분) */
export const DEFAULT_DWELL_MIN = 60
/** 혼잡도 응답 캐시 TTL (분), 장소코드 키 */
export const CONGESTION_CACHE_TTL_MIN = 30
