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

## 카카오 API 키 설정

외부 길찾기/지도는 카카오 API를 쓴다. 개발 시작 전에 키를 발급받아 `.env`에 넣는다.

1. [카카오 개발자 콘솔](https://developers.kakao.com)에서 애플리케이션 생성
2. **플랫폼 → Web** 에 사이트 도메인 등록: `http://localhost:5173` (포트까지 정확히)
3. **앱 키**에서 REST API 키와 JavaScript 키 확인
4. 프로젝트 루트에 `.env` 생성 (`.env.example` 참고) 후 값 채우기:
   ```
   KAKAO_REST_API_KEY=REST_키
   VITE_KAKAO_JS_KEY=JavaScript_키
   ```

`.env`는 `.gitignore`되어 커밋되지 않는다.

### 호출 방식 (중요)

REST 길찾기 API는 브라우저에서 직접 부르면 CORS로 막히고 키가 노출된다.
그래서 개발 시 Vite dev 프록시를 거친다. 프론트는 카카오를 직접 부르지 않고
아래 경로만 호출하면 Vite가 `Authorization` 헤더를 붙여 카카오로 전달한다.

- `/api/kakao/dapi/*` → `https://dapi.kakao.com` (로컬/대중교통/도보)
- `/api/kakao/navi/*` → `https://apis-navi.kakaomobility.com` (자차 길찾기)

카카오모빌리티 길찾기 등 일부 API는 별도 이용 신청/약관 확인이 필요할 수 있다
(AGENTS.md 18장).

## 작업 분담

- **A 담당**: 경로 + 점수 + 혼잡도 (`features/routing`, `features/congestion`, `shared/cache`)
- **B 담당**: 주차 + UI (`features/parking`, `ui`)

자세한 지시는 [`AI_SPEC.md`](./AI_SPEC.md) 참고.
