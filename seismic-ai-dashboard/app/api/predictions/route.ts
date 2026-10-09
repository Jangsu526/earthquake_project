import { fastApiUrl } from "../fastapi";
import { parseHistory } from "../../prediction-history-contract";

export async function GET() {
  try {
    const response = await fetch(fastApiUrl("/predictions?limit=10"), {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return Response.json({ error: response.status === 503 ?
      "데이터베이스 이력을 일시적으로 조회할 수 없습니다." : "이력 조회 API가 오류를 반환했습니다." }, { status: 502 });
    const data = parseHistory(await response.json());
    if (!data) return Response.json({ error: "이력 응답 형식이 올바르지 않습니다." }, { status: 502 });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return Response.json({ error: timeout ? "이력 조회 시간이 초과되었습니다." : "이력 서버 연결 또는 응답 처리에 실패했습니다." }, { status: timeout ? 504 : 502 });
  }
}
