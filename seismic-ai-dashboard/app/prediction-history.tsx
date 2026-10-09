"use client";

import { useEffect, useState } from "react";
import { CLASS_NAMES } from "./inference-contract";
import { parseHistory, type HistoryRecord } from "./prediction-history-contract";

export default function PredictionHistory() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timer = setTimeout(() => controller.abort(), 12000);
    async function load() {
      try {
        const response = await fetch("/api/predictions?limit=10", { cache: "no-store", signal: controller.signal });
        const data: unknown = await response.json();
        if (!response.ok) {
          const message = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "이력 조회에 실패했습니다.";
          throw new Error(message);
        }
        const history = parseHistory(data);
        if (!history) throw new Error("이력 응답 형식이 올바르지 않습니다.");
        if (!disposed) setRecords(history.predictions);
      } catch (cause) {
        if (!disposed) setError(controller.signal.aborted ? "이력 조회 시간이 초과되었습니다." :
          cause instanceof TypeError || cause instanceof SyntaxError ? "이력 서버 연결 또는 응답 처리에 실패했습니다." :
          cause instanceof Error ? cause.message : "이력 조회에 실패했습니다.");
      } finally {
        clearTimeout(timer);
        if (!disposed) setLoading(false);
      }
    }
    void load();
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [retry]);

  return (
    <section id="history" className="card history-card" aria-busy={loading}>
      <div className="section-heading"><div><span className="step">03</span><h2>PostgreSQL 추론 이력</h2><span className="count">{loading || error ? "—" : records.length}</span></div><button type="button" className="secondary-button" disabled={loading} onClick={() => { setLoading(true); setError(""); setRetry(value => value + 1); }}>이력 새로고침</button></div>
      {error && <p role="alert" className="history-error">{error} 입력과 AI 추론은 계속 사용할 수 있습니다.</p>}
      <div className="table-scroll"><table><caption className="sr-only">PostgreSQL에서 조회한 최신 추론 기록 최대 10건, 기록 ID 내림차순</caption><thead><tr><th scope="col">기록 ID</th><th scope="col">샘플 ID</th><th scope="col">모델</th><th scope="col">분류 결과</th><th scope="col">신뢰도</th><th scope="col">저장 시각</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6} role="status">DB 이력을 불러오는 중입니다…</td></tr> : error ? <tr><td colSpan={6}>이력을 표시하지 못했습니다. 이력 새로고침으로 다시 시도해 주세요.</td></tr> : records.length === 0 ? <tr><td colSpan={6}>저장된 추론 이력이 없습니다.</td></tr> : records.map(record => <tr key={record.id} data-record-id={record.id}><td className="mono">{record.id}</td><td className="mono">{record.sample_id}</td><td>{record.model_name}</td><td><span className={`classification ${record.prediction_class === 2 ? "noise" : ""}`}>{CLASS_NAMES[record.prediction_class].ko} · {CLASS_NAMES[record.prediction_class].en}</span></td><td className="mono">{(record.confidence * 100).toFixed(2)}%</td><td className="mono"><time dateTime={record.created_at}>{record.created_at.replace("T", " ")}</time></td></tr>)}
      </tbody></table></div>
      <div className="table-footer" aria-live="polite">{loading ? "이력 조회 중" : error ? "이력 조회 실패" : `최신 DB 기록 ${records.length}건`}<span>최대 10건 · 최신 ID 순 · 저장 시각은 API 원문 기준</span></div>
    </section>
  );
}
