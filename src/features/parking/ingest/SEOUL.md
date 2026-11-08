> 후속 작업으로 실제 화면 연결이 추가되었습니다. [현재 연결 상태](./COMBINED.md)를 먼저 참고하세요. 아래는 서울시 단독 모듈 개발 당시 기록입니다.

# 서울시 공영주차장 모듈

현재 상태: 서버용 수집·변환, SQLite 저장, 반경 검색을 구현했다. 사용자의 요청에 따라
Vite 설정, UI provider 교체, 서버 HTTP 엔드포인트는 연결하지 않았다.
따라서 현재 화면은 여전히 SampleParkingProvider를 사용한다.
2026-11-03 공단 v1 수집·검색 모듈이 추가되었다. [공단 모듈 안내](./TS_PARKING.md)를 참고한다. 두 출처 통합과 화면 연결은 아직 미구현이다.

## 공식 데이터

- 서울시 공영주차장 안내 정보: https://data.seoul.go.kr/dataList/openApiView.do?infId=OA-13122&srvType=A
- 서비스명: GetParkInfo (JSON), 요청당 최대 1,000행
- 서버 환경변수: SEOUL_PARKING_KEY (키를 브라우저나 로그로 전달하지 않는다)
- Node 22.13 이상: 기존 node:sqlite 저장 모듈 사용

## 구성

- providers/seoul.ts: 공식 API 페이지 수집 및 ParkingSnapshot 변환. 서버 전용이므로
  브라우저용 providers/index.ts에서 export하지 않는다.
- ingest/seoul-store.ts: 서버에서 한 인스턴스를 공유해 동시 수집을 합친다.
  검색이 발생한 KST 날짜에 한 번 전체 데이터를 갱신한다. 자동 스케줄러는 아니다.
  날짜가 바뀐 뒤에는 어제 데이터로 먼저 응답하고 뒤에서 갱신한다 (COMBINED.md '갱신 방식').
- 기존 SqliteParkingProvider, findParkingCandidates와 함께 사용한다.
- 전용 DB 파일은 data/seoul-parking.sqlite. 다른 공급자/샘플 DB와 섞지 않는다.
  현재 로컬 파일은 실제 조회 검증으로 생성했으며 .gitignore의 *.sqlite로 제외된다.

## 변환 기준과 한계

- 주차장코드(PKLT_CD)를 seoul: 접두사와 함께 ID로 사용해 다른 출처와 구분한다.
- 같은 코드의 반복 행은 하나로 합친다. 첫 번째 유효 좌표를 사용하며,
  요금이 충돌하면 요금 정보 없음(null)으로 둔다.
- 좌표 0,0, 잘못된 좌표, 이름/코드 누락은 제외한다.
- 이름에 관광버스, 버스 전용, 화물이 명시된 주차장은 승용차 추천에서 제외한다.
  이는 이름 기반의 보수적 필터이며 모든 차량 이용제한을 판별하는 기능은 아니다.
- 요금은 PRK_CRG/PRK_HM/ADD_CRG/ADD_UNIT_TM_MNT/DLY_MAX_CRG를 사용한다.
  추가 단위 시간 등 필수 요금 항목이 누락되면 null이다.
- CHGD_FREE_NM이 '무료'일 때만 무료로 처리한다. 일 최대요금 0은 상한 없음으로
  처리하며 무료로 계산하지 않는다.
- 요금은 기본 요율에 따른 예상값이다. 운영시간, 주말/공휴일/야간 무료,
  할인/정기권, 입차 가능 여부는 아직 반영하지 않는다. 화면 연결 시 반드시 안내한다.
- 실시간 잔여석은 제공하지 않는다.
- 일부 페이지 실패/누락, 조회 중 총건수 변경, 유효시설 0건이면 기존 DB를 유지한다.
  DB가 비어 있는 첫 수집이면 오류를 반환하고, 이미 데이터가 있으면 오류 대신 기존(오래된)
  데이터를 계속 쓰며 서버 로그에 남긴다 (COMBINED.md '갱신 방식'). 샘플로 대체하지 않는다.
- 서울시 원본 전체 건수와 검색 가능한 고유 시설 수는 다르다. 전체 서울 주차장을
  빠짐없이 제공한다고 표시하지 않는다.

## 서버 연결 예시 (아직 앱에는 미연결)

```ts
import { fetchSeoulParkingSnapshot } from '../providers/seoul'
import { openParkingDatabase } from './sqlite.mjs'
import { SeoulParkingStore } from './seoul-store'
import { findParkingCandidates } from '../finder'

const db = openParkingDatabase('data/seoul-parking.sqlite')
const provider = new SeoulParkingStore(db, () =>
  fetchSeoulParkingSnapshot(process.env.SEOUL_PARKING_KEY ?? ''),
)
// 실제 서버에서는 요청마다 인스턴스를 만들지 않고 공유한다.
// 서버 프로세스가 .env를 로드한 상태여야 한다.
try {
  const candidates = await findParkingCandidates(
    provider,
    { lat: 37.5665, lng: 126.978 },
    60,
  )
  // HTTP 응답으로 candidates만 전달. 키는 응답에 포함하지 않는다.
} finally {
  // 실제 서버에서는 요청 종료가 아닌 서버 종료 시 close한다.
  db.close()
}
```

## 검증

외부 API 자동 테스트는 모두 mock 처리한다.

```sh
npx vitest run src/features/parking
```

2026-10-02 실제 수동 조회: 원본 2,189행 → 부적합 811행 제외 → 중복 1,272행 병합 →
고유 106개 적재. 서울시청 좌표 반경 1km에서 후보 3개 반환을 확인했다.
이 수치는 당시 응답 기준이며 이후 갱신에 따라 달라진다.

전체 자동 테스트 197개 통과, 새 모듈 lint 통과.
전체 앱 타입 검사에서는 기존 routing/summary.ts의 park-transit 라벨 누락으로 실패한다.
해당 파일은 이번 승인 범위 밖이므로 수정하지 않았다.
