import type { Prediction } from "./inference-contract";

export type HistoryRecord = Prediction & { model_name: string; created_at: string };
export type HistoryResponse = { count: number; predictions: HistoryRecord[] };

export function parseHistory(value: unknown): HistoryResponse | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (!Number.isInteger(data.count) || !Array.isArray(data.predictions) ||
      data.predictions.length !== data.count || data.predictions.length > 10) return null;
  const ids = new Set<number>();
  for (const row of data.predictions) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    const record = row as Record<string, unknown>;
    if (typeof record.id !== "number" || !Number.isSafeInteger(record.id) || record.id <= 0 || ids.has(record.id) ||
        typeof record.sample_id !== "string" || !record.sample_id.trim() ||
        typeof record.model_name !== "string" || !record.model_name.trim() ||
        typeof record.created_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(record.created_at) ||
        !Number.isFinite(Date.parse(record.created_at)) ||
        (record.prediction_class !== 0 && record.prediction_class !== 1 && record.prediction_class !== 2) ||
        typeof record.confidence !== "number" || !Number.isFinite(record.confidence) || record.confidence < 0 || record.confidence > 1) return null;
    ids.add(record.id);
  }
  return { count: data.predictions.length, predictions: [...data.predictions].sort((a, b) => b.id - a.id) as HistoryRecord[] };
}
