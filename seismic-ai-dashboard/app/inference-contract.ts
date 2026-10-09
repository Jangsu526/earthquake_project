export const SAMPLE_ID = "152A.N4_20180623135517_EV";

// src/inspect_stead.py:109,127,139 and 180,199,211.
// src/proposed_model.py uses these integer labels without remapping.
export const CLASS_NAMES = {
  0: { ko: "미소지진", en: "Micro Earthquake" },
  1: { ko: "강진", en: "Macro Earthquake" },
  2: { ko: "노이즈", en: "Noise" },
} as const;

export type Waveform = [number, number, number][];
export type Prediction = {
  id: number;
  sample_id: string;
  prediction_class: keyof typeof CLASS_NAMES;
  confidence: number;
};

export const MAX_JSON_BYTES = 1024 * 1024;

export function waveformError(value: unknown): string | null {
  if (!Array.isArray(value)) return "파형은 [시점][채널] 형태의 2차원 배열이어야 합니다.";
  if (value.length !== 1000) return `시점은 정확히 1000개여야 합니다. 현재 ${value.length}개입니다.`;
  for (let i = 0; i < value.length; i++) {
    const row = value[i];
    if (!Array.isArray(row) || row.length !== 3) return `${i + 1}번째 시점은 정확히 3개 채널이어야 합니다.`;
    for (let channel = 0; channel < 3; channel++) {
      const item = row[channel];
      if (typeof item !== "number") return `${i + 1}번째 시점, 채널 ${channel + 1}: 숫자만 입력해 주세요. 문자열·null은 사용할 수 없습니다.`;
      if (!Number.isFinite(item)) return `${i + 1}번째 시점, 채널 ${channel + 1}: NaN 또는 무한대 값은 사용할 수 없습니다.`;
      if (Math.abs(item) > 3.4028234663852886e38) return `${i + 1}번째 시점, 채널 ${channel + 1}: 모델이 처리할 수 있는 float32 범위를 벗어났습니다.`;
    }
  }
  return null;
}

export function isWaveform(value: unknown): value is Waveform {
  return waveformError(value) === null;
}

export function isSampleId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(value);
}

export function parseWaveformJSON(text: string): { waveform: Waveform; sample_id?: string } {
  if (new TextEncoder().encode(text).length > MAX_JSON_BYTES) throw new Error("JSON은 1 MiB 이하로 입력해 주세요.");
  let data: unknown;
  try { data = JSON.parse(text); }
  catch { throw new Error("JSON 형식이 올바르지 않습니다. NaN·Infinity, 주석, 마지막 쉼표는 사용할 수 없습니다."); }
  const object = data !== null && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
  const waveform = object ? object.waveform : data;
  const error = waveformError(waveform);
  if (error || !isWaveform(waveform)) throw new Error(error ?? "입력 파형이 유효하지 않습니다.");
  if (object && object.sample_id !== undefined && !isSampleId(object.sample_id)) {
    throw new Error("샘플 ID는 영문·숫자로 시작하는 1~120자의 영문·숫자·밑줄·마침표·하이픈이어야 합니다.");
  }
  return { waveform, ...(object?.sample_id !== undefined ? { sample_id: object.sample_id as string } : {}) };
}

export function isPrediction(value: unknown, expectedSampleId = SAMPLE_ID): value is Prediction {
  if (value === null || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return typeof data.id === "number" && Number.isSafeInteger(data.id) && data.id > 0 &&
    isSampleId(data.sample_id) && data.sample_id === expectedSampleId &&
    (data.prediction_class === 0 || data.prediction_class === 1 || data.prediction_class === 2) &&
    typeof data.confidence === "number" && Number.isFinite(data.confidence) &&
    data.confidence >= 0 && data.confidence <= 1;
}
