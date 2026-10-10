// Imported only by server-side Route Handlers. Never expose this as NEXT_PUBLIC_*.
export function fastApiUrl(path: string): string {
  const base = process.env.FASTAPI_BASE_URL?.trim() || "http://localhost:8000";
  return `${base.replace(/\/+$/, "")}${path}`;
}

export function fastApiHeaders(): Record<string, string> {
  const key = process.env.FASTAPI_API_KEY;
  if (!key?.trim()) throw new Error("서버 API 인증 설정을 확인해 주세요.");
  return { "X-API-Key": key };
}
