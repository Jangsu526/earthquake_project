"use client";

import { useEffect, useRef, useState } from "react";
import { AUDIO_NOTICE, resampleMicrophone } from "./audio-resampling";
import type { Waveform } from "./inference-contract";

type Props = {
  disabled: boolean;
  onBegin: () => void;
  onEnd: () => void;
  onComplete: (waveform: Waveform, id: string) => void;
};

export default function MicrophoneInput({ disabled, onBegin, onEnd, onComplete }: Props) {
  const [status, setStatus] = useState("녹음 준비");
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const active = useRef<{ dispose: () => void } | null>(null);

  const endCallback = useRef(onEnd);
  useEffect(() => { endCallback.current = onEnd; }, [onEnd]);

  useEffect(() => {
    const stop = () => {
      if (!active.current) return;
      active.current.dispose(); active.current = null;
      endCallback.current(); setBusy(false); setStatus("페이지 이탈로 녹음을 취소했습니다.");
    };
    window.addEventListener("pagehide", stop);
    return () => { window.removeEventListener("pagehide", stop); active.current?.dispose(); active.current = null; };
  }, []);

  function cancel() {
    active.current?.dispose(); active.current = null;
    onEnd(); setBusy(false); setStatus("녹음 취소 · 수집한 오디오를 폐기했습니다.");
  }

  async function start() {
    if (disabled || active.current) return;
    onBegin(); setBusy(true); setWarnings([]); setStatus("마이크 권한 확인 중…");
    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    let node: AudioWorkletNode | undefined;
    let source: MediaStreamAudioSourceNode | undefined;
    let mute: GainNode | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const session = { dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      if (context) context.onstatechange = null;
      if (node) { node.onprocessorerror = null; node.port.onmessage = null; node.port.close(); node.disconnect(); }
      source?.disconnect(); mute?.disconnect();
      stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
      if (context && context.state !== "closed") void context.close().catch(() => {});
    } };
    active.current = session;
    const fail = (message: string) => {
      if (disposed) return;
      session.dispose(); if (active.current === session) active.current = null;
      onEnd(); setBusy(false); setStatus(message);
    };
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("HTTPS 또는 localhost의 데스크톱 Chrome에서 사용해 주세요.");
      context = new AudioContext();
      await context.resume();
      if (disposed) return;
      stream = await navigator.mediaDevices.getUserMedia({ audio: {
        channelCount: { ideal: 1 }, echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      }, video: false });
      if (disposed) { stream.getTracks().forEach(track => track.stop()); return; }
      const settings = stream.getAudioTracks()[0].getSettings();
      if (settings.echoCancellation || settings.noiseSuppression || settings.autoGainControl) {
        setWarnings(["장치의 자동 오디오 처리가 활성화되어 있습니다. 진폭과 파형이 달라질 수 있습니다."]);
      }
      const rate = context.sampleRate;
      if (!Number.isInteger(rate) || rate < 8000 || rate > 192000) throw new Error("지원하지 않는 오디오 샘플링 주파수입니다.");
      await context.audioWorklet.addModule("/audio-capture-worklet.js");
      if (disposed) return;
      node = new AudioWorkletNode(context, "microphone-capture", { processorOptions: { targetSamples: rate * 10 } });
      source = context.createMediaStreamSource(stream);
      mute = context.createGain(); mute.gain.value = 0;
      node.port.onmessage = event => {
        if (disposed) return;
        if (event.data.type === "progress") {
          setStatus(`녹음 중 · ${(event.data.samples / rate).toFixed(1)} / 10초 · ${rate} Hz`);
        } else if (event.data.type === "complete") {
          const pcm = event.data.pcm as Float32Array;
          session.dispose(); active.current = null;
          setStatus("10초 수집 완료 · 변환 중…");
          try {
            const converted = resampleMicrophone(pcm, rate);
            onComplete(converted.waveform, `MIC_EXPERIMENT_${crypto.randomUUID().replaceAll("-", "")}`);
            setWarnings(previous => [...previous, ...converted.warnings]);
            setStatus(`녹음 완료 · ${rate} Hz에서 100 Hz로 변환 · 1000샘플 · 서버 전송 전`);
          } catch { setStatus("오디오 변환에 실패했습니다. 다시 녹음해 주세요."); }
          finally { pcm.fill(0); onEnd(); setBusy(false); }
        }
      };
      node.onprocessorerror = () => fail("오디오 처리 오류입니다. 다시 녹음해 주세요.");
      stream.getTracks().forEach(track => { track.onended = () => fail("마이크 연결이 끊겼습니다. 다시 녹음해 주세요."); });
      context.onstatechange = () => { if (context?.state === "suspended") fail("녹음이 중단되었습니다. 탭을 활성화한 뒤 다시 녹음해 주세요."); };
      source.connect(node); node.connect(mute); mute.connect(context.destination);
      timer = setTimeout(() => fail("10초 분량을 수집하지 못했습니다. 다시 녹음해 주세요."), 15000);
      setStatus(`녹음 중 · 0 / 10초 · ${rate} Hz`);
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : "";
      fail(name === "NotAllowedError" ? "마이크 권한이 거부되었습니다. 브라우저 사이트 설정을 확인해 주세요." :
        name === "NotFoundError" ? "마이크 장치를 찾지 못했습니다." :
        name === "NotReadableError" ? "마이크를 사용할 수 없습니다. 다른 앱의 사용 여부를 확인해 주세요." :
        cause instanceof Error && name === "Error" ? cause.message : "마이크 초기화에 실패했습니다. 데스크톱 Chrome에서 다시 시도해 주세요.");
    }
  }

  return <div>
    <p className="inference-error"><strong>{AUDIO_NOTICE}</strong></p>
    <p className="chart-note">10초 PCM은 메모리에서만 처리합니다. 원본 오디오를 저장하지 않습니다. 추론 실행을 누르면 변환 파형이 서버로 전송되고 결과 메타데이터가 저장됩니다. 100 Hz는 실험 설정이며 학습 데이터의 주파수·진폭 단위는 확인되지 않았습니다.</p>
    <button type="button" className="secondary-button" disabled={disabled || busy} onClick={() => void start()}>10초 녹음 시작</button>{" "}
    <button type="button" className="text-button" disabled={!busy} onClick={cancel}>녹음 취소</button>
    <p role="status" aria-live="polite">{status}</p>
    {warnings.map(message => <p className="chart-note" key={message} role="status">경고: {message}</p>)}
  </div>;
}
