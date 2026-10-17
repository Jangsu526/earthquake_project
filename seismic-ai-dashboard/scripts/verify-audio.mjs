// Offline DSP, AudioWorklet and capture lifecycle tests. No real microphone/network.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url);
function load(file, overrides = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, root), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, Float32Array, Float64Array, URL, Error, crypto: globalThis.crypto, ...globals,
    require(name) {
      if (name in overrides) return overrides[name];
      if (name === './inference-contract') return load('app/inference-contract.ts');
      if (name === './audio-resampling') return load('app/audio-resampling.ts');
      return require(name);
    },
  });
  return exports;
}
const { resampleMicrophone } = load('app/audio-resampling.ts');
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('PASS', name); }
const rms = values => Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
for (const rate of [44100, 48000]) {
  const sine = hz => Float32Array.from({ length: rate * 10 }, (_, i) => 0.25 * Math.sin(2 * Math.PI * hz * i / rate));
  for (const hz of [5, 20]) await check(`${rate} Hz: preserve ${hz} Hz amplitude, phase, 1000x3 shape`, () => {
    const { waveform } = resampleMicrophone(sine(hz), rate);
    assert.equal(waveform.length, 1000);
    const errors = waveform.slice(20, -20).map((row, i) => {
      assert.equal(row.length, 3); assert.equal(row[0], row[1]); assert.equal(row[1], row[2]);
      assert.ok(row.every(Number.isFinite));
      return row[0] - 0.25 * Math.sin(2 * Math.PI * hz * (i + 20) / 100);
    });
    assert.ok(rms(errors) < 0.003);
  });
  for (const hz of [60, 1000]) await check(`${rate} Hz: suppress ${hz} Hz (>50 dB interior)`, () => {
    const { waveform, warnings } = resampleMicrophone(sine(hz), rate);
    assert.ok(rms(waveform.slice(20, -20).map(row => row[0])) / (0.25 / Math.sqrt(2)) < 0.003);
    assert.ok(warnings.some(w => w.includes('사라졌')));
  });
  await check(`${rate} Hz: DC gain is preserved, no amplitude normalization`, () => {
    const { waveform } = resampleMicrophone(new Float32Array(rate * 10).fill(0.2), rate);
    assert.ok(waveform.every(row => Math.abs(row[0] - 0.2) < 1e-6));
  });
  await check(`${rate} Hz: refuse truncated/extra input`, () => {
    assert.throws(() => resampleMicrophone(new Float32Array(rate * 10 - 1), rate));
    assert.throws(() => resampleMicrophone(new Float32Array(rate * 10 + 1), rate));
  });
}
await check('silence, clipping, invalid samples/rate', () => {
  assert.ok(resampleMicrophone(new Float32Array(480000), 48000).warnings.some(w => w.includes('무음')));
  assert.ok(resampleMicrophone(new Float32Array(480000).fill(1), 48000).warnings.some(w => w.includes('클리핑')));
  const invalid = new Float32Array(480000); invalid[100] = NaN;
  assert.throws(() => resampleMicrophone(invalid, 48000));
  assert.throws(() => resampleMicrophone(new Float32Array(1000), 100));
});
let Processor;
vm.runInNewContext(fs.readFileSync(new URL('public/audio-capture-worklet.js', root), 'utf8'), {
  Float32Array, sampleRate: 44100,
  AudioWorkletProcessor: class { constructor() { this.messages = []; this.port = { postMessage: message => this.messages.push(message) }; } },
  registerProcessor: (_, implementation) => { Processor = implementation; },
});
await check('worklet counts samples, averages channels and trims last block exactly', () => {
  const processor = new Processor({ processorOptions: { targetSamples: 441000 } });
  assert.equal(processor.process([]), true);
  let running = true;
  while (running) running = processor.process([[new Float32Array(128).fill(0.2), new Float32Array(128).fill(0.6)]]);
  const messages = processor.messages.filter(m => m.type === 'complete');
  assert.equal(messages.length, 1); assert.equal(messages[0].pcm.length, 441000);
  assert.ok(messages[0].pcm.every(v => Math.abs(v - 0.4) < 1e-6));
});

// Execute the actual component handlers with fake devices and React hooks.
async function captureHarness(permission) {
  const React = require('react'); const states = [], refs = [], cleanups = []; let si = 0, ri = 0;
  const hooks = { ...React, useState(initial) { const index = si++; if (!(index in states)) states[index] = initial;
    return [states[index], v => { states[index] = typeof v === 'function' ? v(states[index]) : v; }]; },
    useRef(initial) { const index = ri++; return refs[index] ??= { current: initial }; },
    useEffect(fn) { if (!cleanups.length) { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); } },
  };
  const tracks = [{ stopped: 0, onended: null, stop() { this.stopped++; }, getSettings() { return {}; } }];
  const stream = { getTracks: () => tracks, getAudioTracks: () => tracks };
  const contexts = [], nodes = [], timers = new Set(), events = {};
  class Context {
    constructor() { this.sampleRate = 48000; this.state = 'running'; this.audioWorklet = { addModule: async () => {} }; contexts.push(this); }
    async resume() {} async close() { this.state = 'closed'; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
  }
  class Node { constructor() { this.port = { onmessage: null, close() {} }; nodes.push(this); } connect() {} disconnect() {} }
  let begins = 0, ends = 0, completed = [];
  const component = load('app/microphone-input.tsx', { react: hooks }, {
    window: { isSecureContext: true, addEventListener: (key, fn) => { events[key] = fn; }, removeEventListener() {} },
    navigator: { mediaDevices: { getUserMedia: () => permission ? permission(stream) : Promise.resolve(stream) } },
    AudioContext: Context, AudioWorkletNode: Node,
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn),
  }).default;
  const render = () => { si = 0; ri = 0; return component({ disabled: false, onBegin: () => begins++, onEnd: () => ends++, onComplete: (...args) => completed.push(args) }); };
  function find(node, label) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'button' && node.props.children === label) return node;
    for (const child of React.Children.toArray(node.props.children)) { const found = find(child, label); if (found) return found; }
  }
  const click = label => find(render(), label).props.onClick();
  const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
  return { click, flush, tracks, contexts, nodes, states, cleanups, events, timers,
    get begins() { return begins; }, get ends() { return ends; }, get completed() { return completed; } };
}
await check('recording completion cleans devices; returns preview only and MIC UUID', async () => {
  const h = await captureHarness(); h.click('10초 녹음 시작'); await h.flush();
  assert.equal(h.completed.length, 0); assert.equal(h.nodes.length, 1);
  const pcm = new Float32Array(480000);
  h.nodes[0].port.onmessage({ data: { type: 'complete', pcm } });
  assert.equal(h.tracks[0].stopped, 1); assert.equal(h.contexts[0].state, 'closed');
  assert.equal(h.completed.length, 1); assert.equal(h.completed[0][0].length, 1000);
  assert.match(h.completed[0][1], /^MIC_EXPERIMENT_[\da-f]{32}$/);
  // PostgreSQL public.predictions.sample_id is VARCHAR(50).
  assert.equal(h.completed[0][1].length, 47);
  assert.ok(h.completed[0][1].length <= 50);
  assert.equal(h.ends, 1); assert.equal(h.timers.size, 0);
});
await check('cancel while permission pending stops late-arriving stream', async () => {
  let resolve; const h = await captureHarness(stream => new Promise(r => { resolve = () => r(stream); }));
  h.click('10초 녹음 시작'); await h.flush(); h.click('녹음 취소'); resolve(); await h.flush();
  assert.equal(h.tracks[0].stopped, 1); assert.equal(h.contexts[0].state, 'closed'); assert.equal(h.nodes.length, 0);
});
await check('permission refusal reports error and releases context', async () => {
  const h = await captureHarness(() => { const e = new Error(); e.name = 'NotAllowedError'; return Promise.reject(e); });
  h.click('10초 녹음 시작'); await h.flush();
  assert.ok(h.states[0].includes('거부')); assert.equal(h.states[1], false); assert.equal(h.contexts[0].state, 'closed');
});
for (const reason of ['cancel', 'unmount', 'pagehide', 'device', 'processor', 'timeout']) await check(`cleanup on ${reason}`, async () => {
  const h = await captureHarness(); h.click('10초 녹음 시작'); await h.flush();
  if (reason === 'cancel') h.click('녹음 취소');
  if (reason === 'unmount') h.cleanups[0]();
  if (reason === 'pagehide') h.events.pagehide();
  if (reason === 'device') h.tracks[0].onended();
  if (reason === 'processor') h.nodes[0].onprocessorerror();
  if (reason === 'timeout') [...h.timers][0]();
  assert.equal(h.tracks[0].stopped, 1); assert.equal(h.contexts[0].state, 'closed'); assert.equal(h.completed.length, 0);
});
console.log(`${passed} audio checks passed.`);
