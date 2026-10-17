import { isWaveform, type Waveform } from "./inference-contract";

export const AUDIO_NOTICE = "Experimental Audio Input / 지진 감지 아님";
export const isAudioExperiment = (id: string) => id.startsWith("MIC_EXPERIMENT_");

/** Windowed-sinc FIR resampler. 35 Hz cutoff, ~100 ms half-width,
 * Blackman window; reflected boundaries compensate the symmetric FIR delay.
 * Output samples are at i/100 seconds. No amplitude normalization is applied.
 */
export function resampleMicrophone(pcm: Float32Array, sampleRate: number): {
  waveform: Waveform; warnings: string[];
} {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || pcm.length !== sampleRate * 10) {
    throw new Error("정확히 10초 분량의 지원되는 PCM 입력이 필요합니다.");
  }
  let peak = 0, energy = 0, clipped = 0;
  for (const value of pcm) {
    if (!Number.isFinite(value)) throw new Error("오디오에 유한하지 않은 값이 있습니다.");
    peak = Math.max(peak, Math.abs(value)); energy += value * value;
    if (Math.abs(value) >= 0.999) clipped++;
  }
  const radius = Math.ceil(sampleRate * 0.1);
  const cutoff = 35 / sampleRate;
  // Precompute coefficients once: supported integer rates have 100 phases or fewer.
  const kernels = new Map<number, Float64Array>();
  const mono = new Float32Array(1000);
  for (let i = 0; i < mono.length; i++) {
    const position = i * sampleRate / 100;
    const center = Math.floor(position);
    const fraction = position - center;
    let kernel = kernels.get(fraction);
    if (!kernel) {
      kernel = new Float64Array(radius * 2 + 1);
      let sum = 0;
      for (let k = -radius; k <= radius; k++) {
        const distance = k - fraction;
        const x = distance / radius;
        const window = Math.abs(x) <= 1 ? 0.42 + 0.5 * Math.cos(Math.PI * x) + 0.08 * Math.cos(2 * Math.PI * x) : 0;
        const t = 2 * cutoff * distance;
        const weight = 2 * cutoff * (t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)) * window;
        kernel[k + radius] = weight; sum += weight;
      }
      for (let k = 0; k < kernel.length; k++) kernel[k] /= sum; // FIR DC gain, not input normalization.
      kernels.set(fraction, kernel);
    }
    let value = 0;
    for (let k = -radius; k <= radius; k++) {
      let index = center + k;
      if (index < 0) index = -index;
      if (index >= pcm.length) index = 2 * pcm.length - 2 - index;
      value += pcm[index] * kernel[k + radius];
    }
    mono[i] = value;
  }
  const waveform: Waveform = Array.from(mono, value => [value, value, value]);
  if (!isWaveform(waveform)) throw new Error("변환된 파형은 유한한 float32 (1000, 3)이어야 합니다.");
  const rms = Math.sqrt(energy / pcm.length);
  // Exclude the 100 ms reflected-edge transient from the signal-loss warning.
  const interior = mono.subarray(10, mono.length - 10);
  const outputRms = Math.sqrt(interior.reduce((sum, value) => sum + value * value, 0) / interior.length);
  const warnings: string[] = [];
  if (peak < 1e-4 || rms < 1e-5) warnings.push("무음 또는 매우 작은 입력입니다.");
  if (clipped > 0) warnings.push("클리핑이 감지되었습니다. 마이크 입력이 너무 클 수 있습니다.");
  if (rms >= 1e-5 && (outputRms < 1e-5 || outputRms / rms < 0.01)) warnings.push("필터 후 신호가 대부분 사라졌습니다. 50 Hz 이상의 소리는 제거됩니다.");
  return { waveform, warnings };
}
