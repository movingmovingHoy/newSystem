# 서울 길찾기 (Seoul Route Finder)

출발지, 경유지(최대 3), 도착지를 입력하면 **자차 / 혼합(주차 후 도보·대중교통) / 전 구간 대중교통** 경로를 비교해 주는 서울 길찾기 웹 서비스.

> 길찾기 엔진은 직접 만들지 않는다. 외부 공식 API 결과를 조합·점수화하고 추천 근거를 제공하는 것이 핵심이다. 규칙의 단일 원본은 [`AGENTS.md`](./AGENTS.md).

## 기술 스택

- Node.js + TypeScript (`strict`)
- Vite + React (프론트)
- Vitest (테스트)
- 캐시: 개발 `lru-cache`, 배포 Redis
- DB: 개발 SQLite

## 폴더 구조

```
src/
  features/
    routing/      # 경로: providers, strategies, optimizer, scoring, timeline
    congestion/   # 혼잡도: providers, areas, calculator
    parking/      # 주차: providers, ingest, finder
  shared/
    cache/        # 캐시 래퍼, 동시 요청 합치기
    types/        # 공통 타입 (AGENTS.md 6장)
    config/       # 상수, 가중치, TTL
  ui/
    tokens/       # 색·폰트·간격 (여기서만 정의)
    components/
```

## 개발

```bash
npm install       # 의존성 설치 (PowerShell에서 막히면: cmd /c "npm install")
npm run dev       # 개발 서버
npm test          # 테스트 (단발)
npm run typecheck # 타입 체크
npm run lint      # 린트
```

## 작업 분담

- **A 담당**: 경로 + 점수 + 혼잡도 (`features/routing`, `features/congestion`, `shared/cache`)
- **B 담당**: 주차 + UI (`features/parking`, `ui`)

자세한 지시는 [`AI_SPEC.md`](./AI_SPEC.md) 참고.
