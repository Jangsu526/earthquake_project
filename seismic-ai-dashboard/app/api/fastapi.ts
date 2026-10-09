// Imported only by server-side Route Handlers. Never expose this as NEXT_PUBLIC_*.
export function fastApiUrl(path: string): string {
  const base = process.env.FASTAPI_BASE_URL?.trim() || "http://localhost:8000";
  return `${base.replace(/\/+$/, "")}${path}`;
}
