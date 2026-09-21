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

/**
 * 대중교통 기본요금 (원). 통합 기본요금 하나로 처리한다.
 * 환승·거리비례 추가요금은 매기지 않고 1회 승차 기본요금으로만 인식한다.
 * (MVP 단순화, 튜닝 대상. 수도권 표준값 기준)
 */
export const TRANSIT_BASE_FARE = 1400

/**
 * 도보 mock 추정 상수. 카카오 도보 API(유료) 대신 직선거리 기반 추정에 사용한다.
 * 실물 도보 provider가 붙으면 이 상수는 mock에서만 쓰인다.
 */
/** 보행 속도 (km/h). 도시 보행자 평균 4.0 기준. */
export const WALK_SPEED_KMH = 4.0
/** 우회계수. 직선거리 × 이 값 ≈ 실제 도보 거리. 도시 보행 표준 근사치. */
export const WALK_DETOUR_FACTOR = 1.2

/**
 * 서울시 환승 기준시간 (분). 하차 후 이 시간 이내에 재승차하면 환승으로 인정해
 * 기본요금을 다시 부과하지 않는다. 초과하면 새 승차(기본요금 부과).
 */
export const TRANSFER_WINDOW_MIN = 30
