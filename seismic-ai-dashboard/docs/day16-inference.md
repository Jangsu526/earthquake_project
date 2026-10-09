# DAY 16 — 단일 STEAD 샘플 실제 추론

## 검증된 클래스 매핑

| ID | 표시 이름 | 전처리 근거 (`src/inspect_stead.py`) |
| --- | --- | --- |
| 0 | 미소지진 / Micro Earthquake | micro 필터 `< 3` (22행), 학습 라벨 109행, 테스트 라벨 180행 |
| 1 | 강진 / Macro Earthquake | macro 필터 `>= 3` (23행), 학습 라벨 127행, 테스트 라벨 199행 |
| 2 | 노이즈 / Noise | noise 필터 21행, 학습 라벨 139행, 테스트 라벨 211행 |

학습 데이터 생성 구간은 현재 원본 코드에서 주석 처리되어 있고 테스트 데이터 생성 구간은 활성 코드다. 두 구간의 매핑이 일치한다. `src/proposed_model.py`는 `augmented_tr.npz`의 정수 `label`을 재매핑 없이 학습에 사용하며, 3개 softmax 출력 및 `sparse_categorical_crossentropy`를 사용한다. `src/inference.py`는 출력 `argmax`를 반환한다. 저장된 모델을 재학습하거나 변경하지 않았다.

## 원본 샘플과 요청 경로

- ID: `152A.N4_20180623135517_EV`
- 원본: `data/raw/merged/merge.hdf5`, `data/<ID>`, `(6000, 3)`
- P파 도착 인덱스: 400
- 추출: `[100:1100, :]`, `(1000, 3)`; 기존 `src/test_real_waveform.py`의 P파 300샘플 전부터 시작하는 구간과 일치
- `scripts/export_stead_sample.py`는 HDF5를 읽기 전용으로 열고 해당 구간만 `data/stead-sample.json`으로 내보낸다. 새 라이브러리를 설치하지 않고 기존 Windows 가상환경의 h5py를 사용했다.
- 브라우저 → Next.js `GET /api/sample`: 필요한 샘플만 제공한다. 전체 HDF5나 임의 파일 경로를 노출하지 않는다.
- 브라우저 → Next.js `POST /api/predict`: `{ "sample_id": "152A.N4_20180623135517_EV" }`만 전송한다.
- Next.js → FastAPI `POST http://localhost:8000/predict`: 서버가 보관한 `{ sample_id, waveform }`를 전송한다. 임의 ID는 거부하고 클라이언트가 보낸 파형은 사용하지 않는다.
- 서버와 브라우저 모두 `(1000, 3)`, 숫자 유한성, float32 범위를 검사한다. 입력을 복제·제로 패딩·정규화하지 않는다. SVG에만 표시용 스케일을 적용한다.
- FastAPI 응답 `{ id, sample_id, prediction_class, confidence }`의 ID·클래스·신뢰도·샘플 일치 여부를 검사한다.
- 서버 간 요청으로 브라우저 CORS 설정 변경은 필요 없다. `localhost`는 Next.js 실행 환경 기준이다.

## UI 동작과 범위

샘플을 선택하면 원본 3채널 파형이 표시된다. 추론 실행 버튼으로만 실제 추론을 요청하며, 중복 클릭과 진행 중 샘플 변경을 막는다. 응답 전에는 가상 결과를 표시하지 않는다. 샘플 변경·초기화·새 추론 시작 시 이전 결과를 지운다.

결과에는 실제 클래스 이름, 모델 신뢰도, 샘플 ID, PostgreSQL 기록 ID를 표시한다. 기존 FastAPI는 저장까지 성공한 뒤 응답한다. 세션 이력은 이번 페이지에서 받은 성공 응답 목록이며 `/predictions`로 조회한 전체 이력이 아니다. 새로고침하면 세션 목록만 초기화된다.

입력 오류, 샘플 로드 실패, HTTP 실패, DB 사용 불가, 응답 규격 오류, 시간 초과를 처리한다. 추론 요청 제한 시간은 서버 120초, 브라우저 130초다. 시간 초과 후 자동 재시도하지 않는다. 서버에서 이미 저장했을 가능성이 있으므로 중복 저장 여부를 확인해야 한다.

`/health` 동작과 기존 레이아웃은 유지한다. Docker, PostgreSQL 코드·스키마, 백엔드, 학습 모델은 수정하지 않는다. 마이크, 채널 변환, JSON·파일 입력, 전체 DB 이력 조회는 이번 범위에 포함하지 않는다.

## 실행 및 검증

Node.js 20.9 이상이 필요하다. 실제 임시 Next.js 검증에는 설치된 Node.js 24.21.0을 사용했다.

```bash
cd seismic-ai-dashboard
npm run dev
npm run lint
./node_modules/.bin/tsc --noEmit --incremental false
node scripts/verify-inference.mjs
```

개발 서버에 새 경로가 404로 표시되면 현재 Next.js 서버를 재시작하고 터미널에 표시된 포트를 확인한다. 브라우저에서 샘플 선택 → 1000×3 확인 → 추론 실행 → 실제 결과를 확인한다.

2026-10-09 실제 FastAPI 테스트: HTTP 200, 기록 ID 2, 클래스 0(Micro Earthquake), 신뢰도 `0.9391732215881348` (93.92%). 직접 FastAPI 테스트로 기록 ID 2, 실제 Next.js 중계 테스트로 기록 ID 3을 생성했다. 총 2건이 저장됐다. 이 값을 UI에 고정해 두지 않는다.

실행 중인 localhost:3000의 `/api/sample`은 테스트 당시 404였다. 기존 서버와 원본 `.next`를 변경하지 않기 위해 임시 복사본을 Node.js 24 + Next.js 16.4.0의 webpack 개발 서버(3001)로 실행했다. 실제 `/api/sample` 및 `/api/predict` 경로 모두 HTTP 200을 확인했으며 중계 결과는 클래스 0, 동일한 신뢰도, 기록 ID 3이었다. 소스 기반 테스트 26건과 ESLint·TypeScript 검사를 수행한다. 실제 브라우저 클릭·시각 검증은 미수행이며 사용 중인 개발 서버는 재시작 후 확인해야 한다.
