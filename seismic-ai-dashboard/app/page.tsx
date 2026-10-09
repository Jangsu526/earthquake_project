"use client";

import { useEffect, useRef, useState } from "react";
import PredictionHistory from "./prediction-history";
import { CLASS_NAMES, SAMPLE_ID, isPrediction, isWaveform, parseWaveformJSON, MAX_JSON_BYTES, type Prediction, type Waveform as WaveformData } from "./inference-contract";

function Waveform({ waveform }: { waveform: WaveformData | null }) {
  const colors = ["#108879", "#6484c4", "#c18b46"];
  const scale = waveform ? Math.max(...waveform.flat().map(value => Math.abs(value))) || 1 : 1;
  return (
    <svg viewBox="0 0 720 300" className="waveform" role="img" aria-label={waveform ? "실제 입력 파형: 위에서부터 채널 1, 2, 3. 세 채널에 동일한 표시 스케일을 적용했습니다." : "입력을 검증하면 3채널 파형이 표시됩니다."}>
      <defs><pattern id="grid" width="60" height="25" patternUnits="userSpaceOnUse"><path d="M 60 0 L 0 0 0 25" fill="none" stroke="#e6eeed" strokeWidth="1" /></pattern></defs>
      <rect width="720" height="300" fill="url(#grid)" />
      {colors.map((color, channel) => <g key={channel}>
        <path d={`M0 ${50 + channel * 100}H720`} stroke="#cbdcda" strokeDasharray="4 4" />
        <text x="8" y={16 + channel * 100} fill={color} fontSize="11">채널 {channel + 1}</text>
        {waveform && <polyline points={waveform.map((row, i) => `${Math.round(i * 720 / 999)},${Math.round(50 + channel * 100 - row[channel] / scale * 34)}`).join(" ")} fill="none" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />}
      </g>)}
      {!waveform && <text x="360" y="150" textAnchor="middle" fill="#89979d" fontSize="13">검증된 입력 파형이 여기에 표시됩니다</text>}
    </svg>
  );
}

export default function Home() {
  const [selected, setSelected] = useState("");
  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Prediction | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const requestLock = useRef(false);

  async function loadSample(sampleId: string) {
    if (requestLock.current) return;
    requestLock.current = true;
    setSelected(sampleId);
    setWaveform(null);
    setResult(null);
    setError("");
    if (!sampleId) { requestLock.current = false; return; }
    setLoadingSample(true);
    try {
      const response = await fetch("/api/sample", { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error("STEAD 샘플을 불러오지 못했습니다. 다시 불러와 주세요.");
      const data = await response.json();
      if (data?.sample_id !== SAMPLE_ID || !isWaveform(data?.waveform)) {
        throw new Error("입력 오류: 유한한 숫자의 (1000, 3) STEAD 파형이 필요합니다.");
      }
      setWaveform(data.waveform);
    } catch (cause) {
      setError(cause instanceof TypeError || cause instanceof SyntaxError ? "샘플 서버 연결 또는 응답 처리에 실패했습니다." : cause instanceof Error && cause.name === "TimeoutError" ? "샘플 요청 시간이 초과되었습니다. 다시 시도해 주세요." : cause instanceof Error ? cause.message : "샘플 요청에 실패했습니다.");
    } finally {
      setLoadingSample(false);
      requestLock.current = false;
    }
  }

  async function runPrediction() {
    if (requestLock.current) return;
    if (!selected || !isWaveform(waveform)) {
      setError("입력 오류: 1000개 시점 × 3채널 파형을 먼저 검증해 주세요.");
      return;
    }
    requestLock.current = true;
    setRunning(true);
    setResult(null);
    setError("");
    try {
      const response = await fetch("/api/predict", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "stead" ? { sample_id: selected } : { source: "json", sample_id: selected, waveform }), signal: AbortSignal.timeout(130000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "추론 요청에 실패했습니다.");
      if (!isPrediction(data, selected)) throw new Error("예측 응답 형식이 올바르지 않습니다.");
      setResult(data);
      setHistoryVersion(previous => previous + 1);
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "TimeoutError" ?
        "응답 시간이 초과되었습니다. 자동 재시도하지 않습니다. 저장 여부는 서버에서 확인해 주세요." :
        cause instanceof TypeError || cause instanceof SyntaxError ? "서버에 연결하지 못했거나 응답 형식이 올바르지 않습니다. 서버 상태를 확인해 주세요." :
        cause instanceof Error ? cause.message : "API 연결 또는 추론에 실패했습니다.");
    } finally {
      setRunning(false);
      requestLock.current = false;
    }
  }
  const [connection, setConnection] = useState<"checking" | "connected" | "disconnected">("checking");
  const [mode, setMode] = useState<"stead" | "json" | "file">("stead");
  const [draft, setDraft] = useState("");
  const [filename, setFilename] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  function resetInput() {
    if (requestLock.current) return;
    setSelected(""); setWaveform(null); setResult(null); setError("");
    setDraft(""); setFilename("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function changeMode(next: typeof mode) {
    if (requestLock.current) return;
    resetInput(); setMode(next);
  }

  function acceptJSON(text: string) {
    setWaveform(null); setResult(null); setSelected(""); setError("");
    try {
      const parsed = parseWaveformJSON(text);
      setSelected(parsed.sample_id ?? `JSON_${crypto.randomUUID()}`);
      setWaveform(parsed.waveform);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "입력 데이터를 확인해 주세요.");
    }
  }

  async function readFile(file: File | undefined) {
    if (!file || requestLock.current) return;
    setWaveform(null); setResult(null); setSelected(""); setError(""); setFilename(file.name);
    if (!file.name.toLowerCase().endsWith(".json")) { setError(".json 확장자의 파일을 선택해 주세요."); return; }
    if (file.size > MAX_JSON_BYTES) { setError("JSON 파일은 1 MiB 이하만 업로드할 수 있습니다."); return; }
    requestLock.current = true; setLoadingSample(true);
    try {
      const text = await file.text();
      setDraft(text); acceptJSON(text);
    } catch { setError("파일을 읽지 못했습니다. 파일을 다시 선택해 주세요."); }
    finally { setLoadingSample(false); requestLock.current = false; }
  }


  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    async function checkHealth() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 7000);
      try {
        const response = await fetch("/api/health", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data: unknown = response.ok ? await response.json() : null;
        const connected = data !== null && typeof data === "object" &&
          "status" in data && data.status === "ok";
        if (!disposed) setConnection(connected ? "connected" : "disconnected");
      } catch {
        if (!disposed) setConnection("disconnected");
      } finally {
        clearTimeout(timeout);
        if (!disposed) timer = setTimeout(checkHealth, 15000);
      }
    }

    void checkHealth();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
    };
  }, []);

  const connectionLabel = connection === "connected" ? "연결됨" :
    connection === "disconnected" ? "연결 안 됨" : "확인 중";
  const className = result ? CLASS_NAMES[result.prediction_class] : null;
  const confidence = result ? (result.confidence * 100).toFixed(2) : null;

  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#main">본문으로 이동</a>
      <aside className="sidebar">
        <a href="#overview" className="brand"><span className="brand-icon" aria-hidden="true">∿</span><span>SEISMIC<span className="brand-ai"> AI</span><small>EARTHQUAKE INTELLIGENCE</small></span></a>
        <div className="workspace-label">WORKSPACE <span>DAY 17</span></div>
        <nav aria-label="대시보드 메뉴">
          <a className="nav-link current" href="#overview"><span aria-hidden="true">▦</span> 대시보드 <span className="nav-dot" /></a>
          <a className="nav-link" href="#model"><span aria-hidden="true">◇</span> 모델 소개</a>
          <a className="nav-link" href="#input"><span aria-hidden="true">∿</span> 지진파 입력</a>
          <a className="nav-link" href="#history"><span aria-hidden="true">◷</span> 추론 이력</a>
        </nav>
        <div className="sidebar-bottom"><div className="environment"><span className="status-dot" /> WAVEFORM INFERENCE<small aria-live="polite">FastAPI {connectionLabel} · 실제 추론</small></div><div className="researcher"><span className="avatar">EQ</span><div>Earthquake AI<small>Research workspace</small></div></div></div>
      </aside>

      <div className="main-shell">
        <header className="topbar"><div>워크스페이스 <span>/</span> <strong>대시보드</strong></div><span className="outline-badge"><span className="status-dot" /> 3채널 파형 추론</span></header>
        <main id="main">
          <section id="overview" className="page-heading"><div><div className="eyebrow">SEISMIC ANALYSIS WORKSPACE</div><h1>지진 이벤트 분석 대시보드<span>.</span></h1><p>지진파 데이터에서 인사이트까지, AI 기반 이벤트 분류 워크스페이스</p></div><span className="day-tag">DAY 17 <span>LIVE INFERENCE</span></span></section>
          <div className="notice"><span className="notice-icon" aria-hidden="true">i</span><p><strong>STEAD · JSON 붙여넣기 · JSON 파일 입력을 지원합니다.</strong> 실제 모델을 호출하며, 성공한 추론은 기존 API에 의해 PostgreSQL에 저장됩니다.</p><span className="demo-badge">LIVE API</span></div>

          <section id="model" className="model-grid" aria-label="모델 소개">
            <article className="card model-card"><div className="card-eyebrow">THE MODEL <span className="small-chip">TensorFlow</span></div><h2>Earthquake Event Classifier</h2><p>TensorFlow로 개발한 지진 이벤트 분류 모델을 웹에서 실행하고, 예측 결과와 추론 이력을 확인하는 분석 환경입니다.</p><div className="model-tags"><span>지진파 분석</span><span>Micro · Macro · Noise</span><span>AI 추론</span></div></article>
            <article className="card metric"><span className="metric-icon" aria-hidden="true">⌁</span><p>분석 워크플로</p><strong>Waveform <span>→</span> Class</strong><small>데이터 입력부터 이벤트 분류까지</small></article>
            <article className="card metric"><span className="metric-icon neutral" aria-hidden="true">⎇</span><p>서비스 연결 상태</p><strong role="status">{connectionLabel} <span className={connection === "connected" ? "status-dot" : "muted-dot"} /></strong><small>GET /health · 15초 간격 확인</small></article>
          </section>

          <div className="analysis-grid">
            <section id="input" className="card input-card"><div className="section-heading"><div><span className="step">01</span><h2>지진파 데이터 입력</h2></div><span className="subtle-label">WAVEFORM INPUT</span></div>
              <div className="input-body">
                <div className="input-modes" role="group" aria-label="입력 방식">
                  {([ ["stead", "STEAD 샘플"], ["json", "JSON 붙여넣기"], ["file", "JSON 파일"] ] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={mode === key} disabled={loadingSample || running} onClick={() => changeMode(key)}>{label}</button>)}
                </div>
                {mode === "stead" ? <>
                  <div className="field-heading"><label htmlFor="stead-sample">STEAD 샘플 선택</label><span>원본 3채널</span></div>
                  <select id="stead-sample" className="sample-select" value={selected} disabled={loadingSample || running} onChange={event => void loadSample(event.target.value)} aria-describedby="input-status input-help">
                    <option value="">샘플을 선택하세요</option><option value={SAMPLE_ID}>{SAMPLE_ID}</option>
                  </select>
                </> : mode === "json" ? <>
                  <div className="field-heading"><label htmlFor="waveform-json">JSON 파형 데이터</label><span>최대 1 MiB</span></div>
                  <textarea id="waveform-json" value={draft} disabled={loadingSample || running} spellCheck={false} placeholder={'[[0.1, 0.2, 0.3], ...] 또는 {"waveform": [...], "sample_id": "my_sample"}'} onChange={event => { setDraft(event.target.value); setWaveform(null); setResult(null); setSelected(""); setError(""); }} aria-describedby="json-format input-status" />
                </> : <>
                  <div className="field-heading"><label htmlFor="waveform-file">JSON 파일 업로드</label><span>최대 1 MiB</span></div>
                  <input id="waveform-file" ref={fileInput} className="file-input" type="file" accept=".json,application/json" disabled={loadingSample || running} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void readFile(file); }} aria-describedby="json-format input-status" />
                  {filename && <p className="chart-note">선택 파일: {filename}</p>}
                </>}
                {mode !== "stead" && <p id="json-format" className="chart-note">1000개의 [채널1, 채널2, 채널3] 배열 또는 waveform 필드가 있는 JSON 객체. sample_id는 선택 사항이며 생략하면 자동 생성합니다.</p>}
                <p id="input-status" className="input-status" aria-live="polite">{loadingSample ? "데이터 불러오는 중…" : waveform ? `검증 완료 · 1000개 시점 × 3채널 · 샘플 ID: ${selected}` : "입력 후 검증에 성공하면 파형과 추론 버튼이 활성화됩니다."}</p>
                <div className="input-actions">
                  {mode === "stead" ? <button className="secondary-button" disabled={!selected || loadingSample || running} onClick={() => void loadSample(selected)}>샘플 다시 불러오기</button> : mode === "json" ? <button className="secondary-button" disabled={!draft.trim() || loadingSample || running} onClick={() => acceptJSON(draft)}>JSON 검증 및 파형 표시</button> : <span className="chart-note">파일 선택 후 자동 검증합니다.</span>}
                  <button className="text-button" disabled={loadingSample || running} onClick={resetInput}>초기화</button>
                </div>
                <div className="wave-heading"><span><span className="status-dot" /> 실제 입력 파형 · 3채널</span><span className="demo-badge">{mode === "stead" ? "STEAD 원본" : "사용자 데이터"}</span></div>
                <Waveform waveform={waveform} /><div className="axis-labels"><span>{mode === "stead" ? "100" : "0"}</span><span>샘플 인덱스</span><span>{mode === "stead" ? "1099" : "999"}</span></div><p className="chart-note">{mode === "stead" ? "HDF5 [100:1100, :] · " : ""}채널별 구간과 색상으로 구분 · 공통 스케일은 표시에만 적용 · 원본 값으로 추론</p>
                <div className="run-area"><p id="input-help">검증된 원본 3채널 데이터로 실제 추론 및 PostgreSQL 저장을 실행합니다. 입력 수정 시 다시 검증해야 합니다.</p>
                  {error && <p role="alert" className="inference-error">{error}</p>}
                  <button className="primary-button" disabled={!waveform || loadingSample || running} onClick={() => void runPrediction()}><span aria-hidden="true">▷</span>{running ? "AI 추론 진행 중…" : "AI 추론 실행"}<span>POST /predict</span></button>
                </div>
              </div>
            </section>
            <section className="card result-card" aria-labelledby="result-title"><div className="section-heading"><div><span className="step">02</span><h2 id="result-title">예측 결과</h2></div><span className="demo-badge">{result ? "실제 모델 응답" : "추론 대기"}</span></div>
              <div className="result-body" aria-live="polite" aria-busy={running}><div className="result-icon" aria-hidden="true">∿</div><span className="eyebrow">MODEL CLASSIFICATION</span>
                <h3>{className?.en ?? (running ? "분석 중" : "결과 대기")}</h3><p>{className?.ko ?? "입력을 검증한 뒤 추론을 실행해 주세요."}</p>
                <div className="confidence"><div><span>예측 신뢰도</span><strong>{confidence ?? "—"}<span>{result ? "%" : ""}</span></strong></div><div className="confidence-track"><span style={{ width: result ? `${result.confidence * 100}%` : "0%" }} /></div></div>
                <dl className="result-details"><div><dt>샘플 ID</dt><dd>{result?.sample_id ?? "—"}</dd></div><div><dt>클래스 ID</dt><dd>{result?.prediction_class ?? "—"}</dd></div><div><dt>PostgreSQL 기록 ID</dt><dd>{result?.id ?? "—"}</dd></div></dl>
                <div className="result-note">{result ? "실제 /predict 응답입니다. 신뢰도는 모델 출력 확률이며 실제 정답 여부를 보증하지 않습니다." : "가상 예측값은 표시하지 않습니다. 성공한 API 응답만 결과에 표시됩니다."}</div>
              </div>
            </section>
          </div>
          <PredictionHistory key={historyVersion} />
          <footer className="page-footer"><span><strong>SEISMIC AI</strong> / Earthquake research project</span><span>TensorFlow · Next.js <span className="footer-dot">·</span> Live inference</span></footer>
        </main>
      </div>
    </div>
  );
}
