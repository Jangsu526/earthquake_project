import { fastApiUrl } from "../fastapi";
import sample from "../../../data/stead-sample.json";
import { isPrediction, isWaveform, isSampleId, waveformError, MAX_JSON_BYTES, SAMPLE_ID } from "../../inference-contract";

export async function POST(request: Request) {
  // Limit the streamed body before JSON parsing; do not trust Content-Length alone.
  let text = "";
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "JSON 입력이 비어 있습니다." }, { status: 400 });
  const decoder = new TextDecoder();
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_JSON_BYTES) {
        await reader.cancel();
        return Response.json({ error: "요청 JSON은 1 MiB 이하로 입력해 주세요." }, { status: 413 });
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    return Response.json({ error: "요청 데이터를 읽지 못했습니다." }, { status: 400 });
  } finally { reader.releaseLock(); }

  let body: unknown;
  try { body = JSON.parse(text); }
  catch { return Response.json({ error: "요청 JSON 형식이 올바르지 않습니다." }, { status: 400 }); }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "요청 데이터 형식이 올바르지 않습니다." }, { status: 422 });
  }
  const input = body as Record<string, unknown>;
  let payload: { sample_id: string; waveform: unknown };
  if (input.source === "json") {
    const error = waveformError(input.waveform);
    if (error) return Response.json({ error }, { status: 422 });
    if (!isSampleId(input.sample_id)) {
      return Response.json({ error: "샘플 ID 형식이 올바르지 않습니다." }, { status: 422 });
    }
    payload = { sample_id: input.sample_id, waveform: input.waveform };
  } else if ((input.source === undefined || input.source === "stead") && input.sample_id === SAMPLE_ID) {
    // Preserve the canonical server-owned STEAD path, ignoring client waveform data.
    payload = sample;
  } else {
    return Response.json({ error: "지원하는 입력 방식과 샘플을 선택해 주세요." }, { status: 422 });
  }
  if (!isWaveform(payload.waveform)) {
    return Response.json({ error: "샘플은 유한한 숫자의 (1000, 3) 배열이어야 합니다." }, { status: 422 });
  }

  try {
    const response = await fetch(fastApiUrl("/predict"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) {
      const message = response.status === 422 ? "모델이 입력 데이터를 거부했습니다." :
        response.status === 503 ? "백엔드 또는 데이터베이스를 사용할 수 없습니다." :
        "백엔드 추론에 실패했습니다.";
      return Response.json({ error: message }, { status: response.status === 422 ? 422 : 502 });
    }
    const result: unknown = await response.json();
    if (!isPrediction(result, payload.sample_id)) {
      return Response.json({ error: "예측 응답의 클래스, 신뢰도 또는 샘플 ID가 올바르지 않습니다." }, { status: 502 });
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return Response.json({ error: timeout ?
      "추론 응답 시간이 초과되었습니다. 저장 여부는 서버에서 확인해 주세요." :
      "FastAPI 연결 또는 응답 처리에 실패했습니다. 서버 실행 상태를 확인해 주세요." },
      { status: timeout ? 504 : 502 });
  }
}
