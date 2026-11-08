> 후속 작업으로 실제 화면 연결이 추가되었습니다. [현재 연결 상태](./COMBINED.md)를 먼저 참고하세요. 아래는 공단 단독 모듈 개발 당시 기록입니다.

# 한국교통안전공단 주차정보 모듈

2026-11-03: 사용자가 제공한 `주차정보시스템_기술문서_20261001.docx`에 맞춰
공단 서버용 수집·변환·SQLite 검색 연결을 추가했다. UI, Vite 설정은 미변경이다.

## 연결

- 시설: https://apis.data.go.kr/B553881/Parking_v1/PrkSttusInfo_v1
- 운영: https://apis.data.go.kr/B553881/Parking_v1/PrkOprInfo_v1
- 환경변수: TS_PARKING_SERVICE_KEY, 원본 일반 인증키를 서버에서 한 번 URL 인코딩
- 파라미터: format=2, sidoCd=11, 선택적으로 sigunguCd=서울 시군구 코드
- 기본 페이지 크기 9,999, 기능당 최대 300페이지. 한도를 넘거나 일부 페이지가
  누락되면 전체 갱신 실패로 처리한다. 단, 마지막 페이지가 공시 총건수보다
  적으면 다음 페이지가 빈 목록인지 확인한 후 수집된 실제 건수를 사용한다. 대량 수집 전 응답 건수와 이용 한도를 확인한다.
- HTTP·통신 오류에 인증키 포함 URL이나 원본 응답을 노출하지 않는다.
- 실시간 잔여석 API는 사용하지 않는다.

## 파일

- providers/ts-parking.ts: 시설/운영 전체 페이지 수집
- providers/ts-parking-normalize.ts: 관리번호 결합 및 요금 변환
- ingest/ts-store.ts: 기존 날짜별 저장/반경 검색을 재사용하는 생성 함수
- ingest/seoul-store.ts: 공유 클래스 ParkingSnapshotStore, 기존 SeoulParkingStore 이름 유지

```ts
import { openParkingDatabase } from './sqlite.mjs'
import { createTsParkingStore } from './ts-store'
import { findParkingCandidates } from '../finder'

// 서버에서 .env 로드 후 실행. 서울시 DB와 별도 파일을 쓴다.
// 구별로 제한하면 구마다 별도 DB를 사용해야 한다.
const db = openParkingDatabase('data/ts-parking-jongno.sqlite')
const provider = createTsParkingStore(
  db,
  process.env.TS_PARKING_SERVICE_KEY ?? '',
  {
    sigunguCd: '11110',
  },
)
const candidates = await findParkingCandidates(
  provider,
  { lat: 37.5729, lng: 126.9794 },
  60,
)
// 서버 종료 시 db.close(). 요청마다 닫지 않는다.
```

서버 프로세스에서 provider 인스턴스를 공유한다. 검색 시 KST 날짜가 바뀌면 갱신하고,
동시 요청은 합친다. 자동 스케줄러는 등록하지 않는다. 수집 실패 시 기존 DB는 유지한다.
DB가 비어 있는 첫 수집이면 오류를 반환하고, 이미 데이터가 있으면 오류 대신 어제 데이터로
먼저 응답하며 뒤에서 갱신한다 (COMBINED.md '갱신 방식'). 샘플로 대체하지 않는다.

## 데이터 처리 및 제한

- 서울특별시이며 관리주체가 공영(1)인 시설만 사용한다. 민영/기타/불명은 아직 제외한다.
  공영 여부가 현재 입차 가능·일반 개방을 보장하지는 않는다. 운영시간 검증은 미구현이다.
- 잘못된 좌표, 이름·관리번호 누락, 이름에 명시된 관광버스/버스전용/화물 시설은 제외한다.
- ID에 ts: 접두사를 붙인다. 동일 관리번호의 시설정보가 충돌하면 갱신을 거절한다.
- 운영정보는 관리번호로 결합한다. 누락/충돌은 요금 null이다.
- 무료(1)로 명시된 시설만 0원이다. 유료(2)는 단일 기본요율과 유효한 시간/금액이
  모두 있을 때만 변환한다. 추가요금 0은 미기재 가능성 때문에 null로 둔다.
- 여러 요율, 무료 회차시간이 있거나 해석 불가능한 경우 null로 둔다.
- 1일 정액은 자동 최대요금으로 변환하지 않는다. 할인·요일·운영시간·정기권은 미반영이다.
- 서울시와 공단 데이터의 동일 주차장 식별 규칙은 아직 구현하지 않았다.
  두 데이터를 단순 합산하거나 관리번호가 같다고 가정하지 않는다.

## 검증

외부 API 자동 테스트는 mock이다. 전체 테스트 207개 통과, 변경 모듈 lint 통과.
앱 타입 검사는 기존 routing/summary.ts의 park-transit 누락 때문에 실패한다.

실제 종로구 조회: 시설 5,429행 / 운영 5,429행. 필터 후 공영 시설 37개,
현재 계산모델에서 해석 가능한 요금 2개. 메모리 SQLite 적재 후 광화문 인근 후보
시민열린마당뒤, 탑골공원, 서린노외를 반환했다. 실데이터는 로컬 파일에 저장하지 않았다.
서울 전체의 수집·통합 검증은 아직 수행하지 않았다.

다음 단계는 데이터 출처 간 중복 처리, 서버 HTTP 연결, 화면 provider 교체다.
사용자가 보류한 서버 설정/UI 수정은 별도 승인 후 진행한다.
