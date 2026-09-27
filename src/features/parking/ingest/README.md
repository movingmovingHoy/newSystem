# 샘플 주차장 적재와 검색

현재 단계는 가상의 샘플 데이터로 DB 적재와 검색을 검증한다. 실제 교통안전공단 API에 연결하지 않았으며, 샘플 이름에는 `[샘플]`을 표시한다.

## UI에서 사용

`providers/index.ts`의 `SampleParkingProvider`를 만들어 기존 `findParkingCandidates(provider, center, dwellMin)`에 전달한다. 브라우저에서는 메모리의 고정 샘플을 검색하며 SQLite를 불러오지 않는다. 시청 인근에 4개, 강남역 인근에 1개의 가상 시설이 있다. 샘플이 없는 지역은 빈 배열을 반환한다.

## 서버에서 사용

Node 내장 SQLite가 필요하다(Node 22.13 이상, 현재 검증 환경 24.14.1). 추가 npm 패키지는 설치하지 않는다. 이 경로는 브라우저에서 import하지 않는다.

```ts
import { openParkingDatabase } from './sqlite.mjs'
import { ingestParkingSnapshot } from './snapshot'
import { parkingSampleSnapshot } from './samples'
import { SqliteParkingProvider } from '../providers/sqlite'

const database = openParkingDatabase('/absolute/path/parking.sqlite')
try {
  ingestParkingSnapshot(database, parkingSampleSnapshot)
  const provider = new SqliteParkingProvider(database)
  const lots = await provider.search({
    center: { lat: 37.5665, lng: 126.978 },
    radiusM: 1000,
  })
  // lots를 후보 선정 함수에 연결한다.
} finally {
  database.close()
}
```

DB는 관리번호를 기본키로 저장하고 위도·경도 인덱스로 검색 범위를 좁힌다. 정확한 원형 반경 포함 여부는 좌표 간 거리로 다시 확인한다. 거리는 반경 검색용 직선거리이며 도보 경로 거리와 다르다.

시설과 운영정보를 관리번호로 연결하고 요금 누락·잘못된 요금은 `null`로 둔다. 중복 관리번호나 잘못된 좌표는 적재를 거절한다. 같은 KST 날짜에는 다시 적재하지 않는다. 새 날짜의 전체 스냅샷은 트랜잭션으로 교체하며, 실패하면 기존 데이터와 갱신 날짜가 유지된다. 비어 있는 서울 스냅샷은 안전하게 거절한다.

실제 API 응답을 내부 `ParkingSnapshot`으로 변환하는 provider, 서버 HTTP 연결, 하루 1회 실행하는 스케줄러는 아직 연결하지 않았다. 실제 운영정보의 요금 정책과 API 계약 확인 후 연결한다. 자동 실행 작업은 이 단계에서 등록하지 않는다.

## 검증

프로젝트 루트에서 다음을 실행한다.

```sh
npx vitest run src/features/parking --configLoader runner
npx tsc --noEmit -p tsconfig.app.json
```
