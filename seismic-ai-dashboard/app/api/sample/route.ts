import sample from "../../../data/stead-sample.json";
import { isWaveform, SAMPLE_ID } from "../../inference-contract";

export function GET() {
  if (sample.sample_id !== SAMPLE_ID || !isWaveform(sample.waveform)) {
    return Response.json({ error: "STEAD 샘플 데이터가 유효하지 않습니다." }, { status: 500 });
  }
  return Response.json(sample, { headers: { "Cache-Control": "no-store" } });
}
