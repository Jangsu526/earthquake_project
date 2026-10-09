# DAY 18 — PostgreSQL 추론 이력

## 원인과 변경

기존 화면은 `useState`에 이번 페이지의 성공 응답만 누적했다. DB 이력 API를 호출하지 않아 새로고침하면 목록이 사라졌다.

- Next.js `GET /api/predictions?limit=10`이 FastAPI `GET http://localhost:8000/predictions?limit=10`을 중계한다.
- `{count, predictions}` 객체를 검증하며, 배열 단독 응답은 정상 이력으로 취급하지 않는다.
- 전용 `PredictionHistory` 컴포넌트가 마운트 시 DB 이력을 조회한다. 브라우저와 서버 요청 모두 `no-store`를 사용한다.
- 새 추론이 성공하면 이력 컴포넌트의 key를 갱신해 다시 마운트하고 DB를 재조회한다. 로컬 배열에 예측 응답을 추가하지 않는다.
- 최대 10건을 기록 ID 내림차순으로 정렬한다. 기존 백엔드 SQL도 `ORDER BY id DESC LIMIT`를 사용한다.
- 로딩·빈 목록·API 실패를 구분하며, 별도의 이력 새로고침 버튼으로 재시도한다.
- 이력 요청은 입력·추론 잠금과 오류 상태를 공유하지 않는다. 조회에 실패해도 추론 결과와 입력 기능을 유지한다.
- 이전 조회는 컴포넌트 정리 시 중단하고, 이미 종료된 요청은 새 상태를 덮어쓰지 않는다.
- 모델 이름과 저장 시각을 표시한다. 시간대 정보가 없는 API 타임스탬프는 임의로 한국 시간 등으로 변환하지 않고 원문 기준으로 표시한다.

기존 STEAD/JSON 입력, 파형, 실제 추론 계약, 클래스 매핑, FastAPI·DB·Docker·모델 코드는 변경하지 않는다.

## 검사

프론트엔드 디렉터리에서:

```bash
npm run lint
./node_modules/.bin/tsc --noEmit --incremental false
node scripts/verify-inference.mjs
node scripts/verify-history.mjs
```

기존 입력·추론 테스트 57건, 신규 이력 테스트 20건을 확인한다. 신규 테스트는 객체 응답, 정렬, 빈 목록, 응답 오류, 네트워크·DB·시간 초과, 최초 마운트, 페이지 재마운트, 요청 취소 및 오류 표시를 검증한다.

프로젝트 루트에서 실제 설치된 Chrome으로 DB 목록과 새로고침을 검증:

```bash
.venv/Scripts/python.exe seismic-ai-dashboard/scripts/verify-input-menus.py --history
```

실제 STEAD 추론 후 DB 이력 자동 갱신까지 확인하려면:

```bash
.venv/Scripts/python.exe seismic-ai-dashboard/scripts/verify-input-menus.py --history --predict
```

`--predict` 옵션은 기존 API로 실제 추론을 한 번 실행하고 PostgreSQL에 기록 한 건을 추가한다. 검증용 Chrome은 별도 임시 프로필을 사용하고 종료 시 정리한다.

## 실제 브라우저 검증 결과 (2026-10-09)

실행 중인 `http://localhost:3000`에 설치된 Chrome으로 접속해 확인했다.

- 최초 로딩: API와 동일한 DB 기록 ID `[14, 13, 12, 11, 10, 9, 8, 7, 6, 5]` 표시
- 실제 STEAD 추론 성공: 새 PostgreSQL 기록 ID 15 생성, 별도 수동 조작 없이 이력 재조회
- 페이지 새로고침: `[15, 14, 13, 12, 11, 10, 9, 8, 7, 6]` 복원
- 390px 모바일 뷰포트에서 기존 세 입력 메뉴 유지
- 이번 실제 추론 검증으로 DB 기록 1건을 추가했다.
- ESLint·TypeScript 및 기존 57건·신규 20건 자동 테스트 통과

검증 중 기존 개발용 Turbopack 캐시를 재사용할 때 Fast Refresh가 반복되고 브라우저 조회 요청이 취소되는 현상이 있었다. 설치된 Next.js 문서의 `turbopackFileSystemCacheForDev` 설정을 `false`로 적용하고 재시작한 뒤 실제 브라우저 검증이 통과했다. `next.config.ts`의 이 설정은 개발용 디스크 캐시 재사용만 끄며, 새 개발 서버 시작 시 컴파일 시간이 늘 수 있다. 빌드 캐시 및 모델·DB 설정은 변경하지 않았고 `.next`를 수동 삭제·편집하지 않았다.

## 변경 파일

- `app/page.tsx`: 세션 누적 대신 추론 성공 시 DB 이력 컴포넌트 갱신
- `app/prediction-history.tsx`: 최초 조회·빈 목록·로딩·오류·재시도 및 DB 표 표시
- `app/prediction-history-contract.ts`: 실제 객체 응답 검증 및 최신 ID 정렬
- `app/api/predictions/route.ts`: 고정 limit=10의 FastAPI 중계
- `app/globals.css`: 이력 오류 메시지 스타일
- `next.config.ts`: 개발 캐시 재사용 비활성화
- `scripts/verify-inference.mjs`: 기존 추론 성공 테스트를 DB 재조회 트리거에 맞게 수정
- `scripts/verify-history.mjs`: 신규 이력 자동 검증
- `scripts/verify-input-menus.py`: 실제 Chrome에서 DB 목록·추론 후 갱신·페이지 새로고침 검증 옵션 추가
- `docs/day18-history.md`, `docs/implementation-requirements.md`: 현재 동작과 검증 결과 기록
