# HANDOFF — 프로젝트 인수인계 문서

이 문서는 이 저장소를 처음 받는 팀원(특히 [B 담당])과 그 AI 도구가 읽는 안내서다.
규칙의 단일 원본은 여전히 `AGENTS.md`이고, 작업 분담 지시는 `AI_SPEC.md`다.
이 문서는 "지금까지 뭐가 됐고, 뭘 해야 하고, 어떻게 개발/테스트하는지"를 정리한다.

---

## 0. 가장 먼저 (AI에게 주는 지시)

이 저장소에서 AI로 작업할 때, AI에게 이렇게 지시한다:

> 프로젝트 규칙의 단일 원본은 `AGENTS.md`다. 먼저 `AGENTS.md`, `AI_SPEC.md`, `HANDOFF.md`를
> 끝까지 읽고 모든 규칙(범위, 폴더 구조, 타입, 금지사항)을 따라라.
>
> - 나는 [B 담당]이다. `features/parking/*`, `ui/*` 만 수정하고, 그 밖의 파일과
>   `shared/types`는 건드리기 전에 먼저 나에게 물어봐라.
> - 코드 작성 전에 만들거나 바꿀 파일과 역할을 먼저 보여주고, 내가 OK하면 구현해라.
> - 핵심 로직은 테스트를 먼저 쓰고, 기능 하나가 끝나면 테스트 통과 여부를 알려라.
> - **개발 서버를 배포하지 마라.** 로컬 터미널에서 `npm run dev`로 띄워 확인한다 (아래 4장).
> - 외부 API 호출은 반드시 `providers/` 안에서만 한다. dev 프록시 경로를 쓴다 (아래 5장).

---

## 1. 지금까지 구현된 것 ([A 담당] 완료)

경로 계산 로직(A 담당)은 사실상 완성됐다. 모두 **테스트 우선**으로 작성했고, 현재
타입체크 0에러 + 테스트 97개 통과 상태다.

### 완료 모듈 (`src/features/routing`, `src/features/congestion`, `src/shared`)

| 모듈               | 파일                               | 역할                                                     |
| ------------------ | ---------------------------------- | -------------------------------------------------------- |
| 순서 최적화        | `routing/optimizer`                | 경유지 순서 브루트포스 (최대 3개→6가지). 고정순번 지원   |
| 타임라인           | `routing/timeline`                 | 출발시각+이동+체류 누적 → 경유지별 도착/출발 시각        |
| 점수               | `routing/scoring`                  | 시간+비용+피로도+혼잡감점, 성향 프리셋, 근거 문구        |
| 시나리오           | `routing/strategies`               | car-direct / mixed / transit-only 조합                   |
| 오케스트레이터     | `routing/plan.ts`                  | 입력 → 순서최적화 → 3종 Route[] 생성                     |
| 정렬               | `routing/ranking.ts`               | 추천/시간/비용/도보 4기준 정렬 (계산은 그대로, 정렬만)   |
| provider(자차)     | `routing/providers/kakao.ts`       | 카카오모빌리티 자차 길찾기 (실물)                        |
| provider(도보)     | `routing/providers/kakao-walk.ts`  | 카카오 도보 (유료 → 현재 mock 사용)                      |
| provider(대중교통) | `routing/providers/odsay.ts`       | **ODsay 대중교통 (실물, 무료)**. 구간 상세 포함          |
| provider(장소검색) | `routing/providers/kakao-local.ts` | 카카오 로컬 키워드 검색                                  |
| mock provider      | `routing/providers/mock.ts`        | 자차/도보/대중교통 mock (테스트·무키 환경용)             |
| 캐시               | `shared/cache`                     | CachedRouteProvider 래퍼 (키·TTL·동시요청합치기·폴백)    |
| 혼잡도             | `congestion/*`                     | 121곳 폴리곤 매칭 + 서울 도시데이터 XML 파싱 + 예측 조회 |

### 구현 기준 (어떤 근거로 만들었나)

- **점수는 "낮을수록 좋음"** (`AGENTS.md` 6·12장). 임시 UI에서만 화면 표시를
  `1000 - score`로 뒤집어 "높을수록 좋게" 보여준다. 내부 계산·정렬은 그대로.
- **대중교통 요금**: 카카오는 요금을 안 줘서 통합 기본요금 상수(1400원)를 썼지만,
  **ODsay는 실제 요금(payment)을 주므로 그걸 그대로 사용**한다.
- **대중교통 구간 상세**: `Leg.transitDetail`(선택 필드)에 "지하철 2호선 강남→역삼,
  도보 3분" 식 정보를 담는다. 계산엔 안 쓰고 표시용.
- **순서 최적화 기준**: 자차 구간 소요시간 (직선거리 근사 금지, `AGENTS.md` 9장).
- **혼잡도**: 도착 예정 시각 기준. 121곳 밖이거나 예측 범위(향후 12시간) 밖이면
  `level=null`("정보 없음"). 시각은 KST로 처리.
- **도보(접근)는 아직 mock**: 카카오 도보 API가 유료라, 주차장↔경유지 접근 도보는
  mock(직선거리 추정). 대중교통 경로 안의 도보는 ODsay가 이미 포함.

### 확인용 임시 UI

`src/ui/DevPlanCheck.tsx` + `src/App.tsx`는 **A 담당 로직을 눈으로 확인하기 위한 임시 화면**이다.
출발지 검색, 도착지 121곳 선택, 경유지, 성향, 대중교통 provider 선택(ODsay/mock/카카오),
정렬 버튼, 구간 상세 표시가 들어있다. **정식 UI가 아니며, [B 담당]이 정식 UI를 만들면 삭제한다.**

---

## 2. 앞으로 해야 할 것

### [A 담당] 남은 것 (선택/개선)

- 도보 provider 실물화 (카카오 도보 유료 결제 시) 또는 접근 도보 정밀화
- 자차 상세 경로 좌표 저장 (지도에 실제 도로 모양 선을 그리려면 `Leg`에 좌표 필드 추가 필요 → `shared/types` 변경이라 합의 필요)
- 실제 지도 앱과 수동 비교 (`AGENTS.md` 15장)

### [B 담당] 해야 할 것 (`features/parking/*`, `ui/*`)

`AI_SPEC.md`의 [B 담당] 지시가 원본이다. 요약하면:

1. **`parking/finder`**: 경유지 반경(1km) 주차장 후보 최대 3개 선정
   (가장 가까운 곳 / 최저요금 / 균형). 요금 없는 주차장도 제외하지 않음.
2. **`parking/ingest`**: 한국교통안전공단 주차장 시설정보를 DB에 배치 적재
   (처음엔 샘플 데이터). 요금 없으면 `fee=null`.
3. **`parking/providers`**: `ParkingProvider`(search, getAvailability). 잔여석은 MVP에서 "정보 없음".
4. **UI 전체** (`ui/`): 입력 화면 → 경유지별 주차 선택(지도+마커) → 결과 비교 화면.
   디자인 토큰(`ui/tokens`)만 참조, 색/폰트 하드코딩 금지.

**연결 지점**: A 담당의 `planRoutes(providers, input)`는 이미 완성돼 있고,
`input.waypoints[]`에 **주차장 선택 결과(parkingLotId, parkingLocation, parkingFee)**를
받는다. B가 `parking/finder`로 후보를 뽑고 사용자가 고른 주차장을 여기에 넣어 호출하면 된다.
즉 A의 로직은 그대로 두고, B는 "주차 선택 → planRoutes 호출 → 결과 화면" 을 만들면 된다.

`src/features/routing/index.ts`에서 `planRoutes`, `rankRoutes` 등을 import 할 수 있다.

---

## 3. Git으로 개발하는 법 (기본 흐름)

### 처음 받을 때

```bash
git clone https://github.com/movingmovingHoy/newSystem.git
cd newSystem
```

PowerShell에서 npm이 막히면(실행정책) 모든 npm/npx 명령을 `cmd /c "..."`로 감싼다:

```bash
cmd /c "npm install"
```

### 키 설정 (.env) — 중요

`.env`는 **커밋되지 않는다**(비밀 키라서 `.gitignore`에 있음). 그래서 clone하면 `.env`가 없다.
`.env.example`을 복사해 자신의 키를 채운다:

```bash
cmd /c "copy .env.example .env"   # Windows
```

그리고 `.env`를 열어 각 키를 채운다:

```
KAKAO_REST_API_KEY=본인_카카오_REST키
VITE_KAKAO_JS_KEY=본인_카카오_JS키
SEOUL_CITYDATA_KEY=본인_서울도시데이터키
ODSAY_KEY=본인_ODsay_인코딩인증키
```

- 키는 각자 발급받는 게 좋다 (무료라도 일일 쿼터가 키 단위로 공유됨).
- **ODsay 키는 "인코딩 인증키"를 넣는다** (프록시가 그대로 URL에 붙임). 그리고 ODsay 콘솔에서
  서비스 환경을 **SERVER**로 두고 **본인 공인 IP**를 허용 IP에 등록해야 한다
  ("내 아이피" 검색으로 확인). IP가 바뀌면(다른 장소) 다시 등록.

### 매일 작업 흐름

```bash
git pull                          # 최신 코드 받기 (작업 시작 전 항상)
# ... 코드 수정 ...
cmd /c "npm test"                 # 테스트 통과 확인
cmd /c "npx tsc --noEmit"         # 타입 체크
git add <바꾼 파일>               # git add . 보다 특정 파일 권장
git commit -m "feat: ..."         # 커밋 (pre-commit 훅이 lint/format 자동 실행)
git push                          # 올리기 (오늘 작업 끝에 한 번 몰아서 해도 됨)
```

- 커밋 메시지에 괄호 `()` 를 넣으면 일부 셸에서 깨질 수 있으니 피한다.
- pre-commit 훅(husky+lint-staged)이 커밋 시 자동으로 eslint/prettier를 돌린다.
  이 환경에선 훅이 느릴 수 있으니 커밋이 1~2분 걸려도 기다린다.

---

## 4. 로컬에서 테스트하는 법 (배포하지 말 것)

> **AI에게: 개발 서버를 배포/외부 호스팅하지 마라. 아래처럼 로컬 터미널에서만 띄운다.**

### 자동 테스트 (로직 검증)

```bash
cmd /c "npm test"          # 전체 테스트 1회 실행 (vitest run)
cmd /c "npx tsc --noEmit"  # 타입 체크
```

- 외부 API는 테스트에서 mock 처리되므로 키 없이도 돌아간다.

### 눈으로 확인 (개발 서버)

```bash
cmd /c "npm run dev"
```

- 그러면 로컬 주소가 뜬다: **http://localhost:5173** (포트 5173 고정)
- 브라우저에서 그 주소를 열면 임시 UI(`DevPlanCheck`)로 경로 계산을 확인할 수 있다.
- **이 서버는 로컬 전용이다.** 배포하거나 외부에 노출하지 않는다.
- `.env`를 바꾸면 서버를 껐다 다시 `npm run dev` 해야 반영된다.
- 개발 서버는 계속 떠 있는 프로세스라, AI가 대신 실행하지 말고 **사람이 직접 터미널에서** 띄운다.
  (AI는 `npm test`/`tsc` 같은 1회성 명령만 실행)

### dev 프록시 (외부 API는 이걸로 호출)

브라우저에서 카카오/서울/ODsay를 직접 부르면 CORS로 막히고 키가 노출된다.
그래서 `vite.config.ts`의 dev 프록시를 거친다. provider들은 아래 경로만 호출한다:

- `/api/kakao/navi/*` → 카카오모빌리티 (자차/도보)
- `/api/kakao/dapi/*` → 카카오 로컬 (장소검색)
- `/api/seoul/*` → 서울 실시간 도시데이터 (혼잡도)
- `/api/odsay/*` → ODsay (대중교통)

프록시가 키를 서버에서 붙이므로 브라우저에 키가 노출되지 않는다.

---

## 5. GitHub Actions (자동 테스트 결과 보는 법)

push하거나 PR을 올리면 GitHub가 자동으로 lint + 타입체크 + 테스트를 돌린다
(`.github/workflows/ci.yml`).

### 결과 확인

1. 브라우저에서 저장소 열기: https://github.com/movingmovingHoy/newSystem
2. 상단 **Actions** 탭 클릭
3. 방금 push한 커밋의 실행 항목 클릭
4. **초록 체크 ✅** = 통과 / **빨간 X ❌** = 실패
5. 실패하면 항목을 눌러 로그를 펼쳐 어느 단계(lint/typecheck/test)에서 깨졌는지 본다.
   그 로그를 AI에게 그대로 붙여주면 고칠 수 있다.

### 참고

- Node 20 deprecated, ubuntu-latest 관련 경고는 GitHub 쪽 안내일 뿐 실패 원인이 아니다.
- 로컬에서 `npm test`가 통과하면 CI도 대체로 통과한다. 단, 시각/타임존에 의존하는
  테스트는 조심한다 (CI는 UTC). 시각 계산은 KST로 고정해 처리했다.

---

## 6. 자주 겪는 문제

- **`npm` 명령이 안 먹힘 (실행정책)** → `cmd /c "npm ..."` 로 감싸기
- **API 403 / 인증 실패** → 콘솔에서 해당 API 활성화, 키/도메인/IP 등록 확인
  (카카오맵 제품 활성화, ODsay는 SERVER 환경 + 공인 IP)
- **혼잡도 "정보 없음"** → 도착지가 서울 121곳 밖이거나, 출발 시각이 미래(예측 범위 밖).
  출발 시각을 "지금"에 가깝게, 도착지를 121곳으로.
- **도보/대중교통이 mock으로 보임** → 임시 UI에서 대중교통은 ODsay 선택, 도보는 mock 유지(유료).

```

```
