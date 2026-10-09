import { fastApiUrl } from "../fastapi";
export async function GET() {
  try {
    const response = await fetch(fastApiUrl("/health"), {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      redirect: "error",
    });
    const data: unknown = response.ok ? await response.json() : null;
    if (
      data !== null &&
      typeof data === "object" &&
      "status" in data &&
      data.status === "ok"
    ) {
      return Response.json({ status: "ok" }, {
        headers: { "Cache-Control": "no-store" },
      });
    }
  } catch {
    // Network errors, timeouts and invalid JSON all mean unavailable.
  }

  return Response.json({ status: "unavailable" }, {
    status: 503,
    headers: { "Cache-Control": "no-store" },
  });
}
