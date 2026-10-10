// Run with: node scripts/verify-inference.mjs (uses installed TypeScript only).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
const moduleRequire = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
let passed = 0;
function check(name, action) { action(); passed++; console.log('PASS', name); }
function load(relative, fetchImpl, reactImpl, serverEnv = { FASTAPI_API_KEY: "test-only-key" }) {
  const filename = path.resolve(root, relative);
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, process: { env: serverEnv }, Response, Request, AbortSignal, Error, TypeError, SyntaxError, TextEncoder, TextDecoder, crypto: moduleRequire("node:crypto").webcrypto, fetch: fetchImpl,
    require: name => {
      if (name === 'react' && reactImpl) return reactImpl;
      if (!name.startsWith('.')) return moduleRequire(name);
      const resolved = path.resolve(path.dirname(filename), name);
      if (name.endsWith('.json')) return JSON.parse(fs.readFileSync(resolved, 'utf8'));
      return load(resolved + (fs.existsSync(resolved + '.ts') ? '.ts' : '.tsx'), fetchImpl, reactImpl, serverEnv);
    },
  });
  return exports;
}
check('server API URL defaults to localhost', () => assert.equal(load('app/api/fastapi.ts').fastApiUrl('/health'), 'http://localhost:8000/health'));
check('server API URL accepts configured backend and trims trailing slash', () => assert.equal(load('app/api/fastapi.ts', undefined, undefined, { FASTAPI_BASE_URL: ' https://backend.example.test/// ' }).fastApiUrl('/predictions?limit=10'), 'https://backend.example.test/predictions?limit=10'));
const contract = load('app/inference-contract.ts');
const sample = JSON.parse(fs.readFileSync(path.join(root, 'data/stead-sample.json')));
const result = { id: 10, sample_id: contract.SAMPLE_ID, prediction_class: 0, confidence: 0.9391732215881348 };
const request = body => new Request('http://localhost/api/predict', {method:'POST', body:JSON.stringify(body)});
(async () => {
  check('class mapping', () => {
    assert.equal(contract.CLASS_NAMES[0].en, 'Micro Earthquake');
    assert.equal(contract.CLASS_NAMES[1].en, 'Macro Earthquake');
    assert.equal(contract.CLASS_NAMES[2].en, 'Noise');
  });
  check('sample ID and (1000, 3) shape', () => { assert.equal(sample.sample_id, contract.SAMPLE_ID); assert.ok(contract.isWaveform(sample.waveform)); });
  for (const [name, data] of [['short', sample.waveform.slice(1)], ['single channel', Array.from({length:1000},()=>[1])], ['NaN',Array.from({length:1000},()=>[1,2,NaN])], ['float32 overflow',Array.from({length:1000},()=>[1,2,1e100])]]) {
    check('reject '+name, () => assert.equal(contract.isWaveform(data),false));
  }
  check('response validation', () => {
    assert.ok(contract.isPrediction(result));
    for (const bad of [{...result, prediction_class:3},{...result, confidence:1.1},{...result,sample_id:'other'}]) assert.equal(contract.isPrediction(bad),false);
  });
  const served = await load('app/api/sample/route.ts').GET();
  check('sample API', () => {assert.equal(served.status,200);assert.equal(served.headers.get('Cache-Control'),'no-store');});
  const proxy = load('app/api/predict/route.ts', async (url, options) => {
    assert.equal(url,'http://localhost:8000/predict');
    assert.equal(options.method,'POST');
    assert.equal(options.headers['X-API-Key'], 'test-only-key');
    assert.deepEqual(JSON.parse(options.body),sample);
    return Response.json(result);
  });
  const success = await proxy.POST(request({sample_id:contract.SAMPLE_ID,waveform:[[999]]}));
  check('proxy uses canonical waveform, ignoring supplied waveform',()=>assert.equal(success.status,200));
  assert.deepEqual(await success.json(), result);
  const invalid = await proxy.POST(request({sample_id:'other'}));
  check('unknown sample rejected',()=>assert.equal(invalid.status,422));
  const malformed = await proxy.POST(new Request('http://localhost/api/predict',{method:'POST',body:'{'}));
  check('malformed request rejected',()=>assert.equal(malformed.status,400));
  for (const [name, upstream, expected] of [
    ['authentication rejected',()=>Response.json({}, {status:401}),502],
    ['backend validation',()=>Response.json({}, {status:422}),422],
    ['database unavailable',()=>Response.json({}, {status:503}),502],
    ['inference failure',()=>Response.json({}, {status:500}),502],
    ['wrong response',()=>Response.json({...result,prediction_class:9}),502],
    ['invalid JSON',()=>new Response('{'),502],
    ['connection failure',()=>{throw new TypeError('offline')},502],
    ['timeout',()=>{const error=new Error('timeout');error.name='TimeoutError';throw error},504],
  ]) {
    const response = await load('app/api/predict/route.ts',async()=>upstream()).POST(request({sample_id:contract.SAMPLE_ID}));
    check(name,()=>assert.equal(response.status,expected));
  }
  for (const serverEnv of [{}, {FASTAPI_API_KEY: ''}, {FASTAPI_API_KEY: '   '}]) {
    let called = false;
    const denied = await load('app/api/predict/route.ts', async()=>{called=true;return Response.json(result)}, undefined, serverEnv).POST(request({sample_id:contract.SAMPLE_ID}));
    check('missing server key prevents upstream prediction',()=>{assert.equal(denied.status,502);assert.equal(called,false)});
  }
  const health = await load('app/api/health/route.ts', async(url,options)=>{
    assert.equal(url,'http://localhost:8000/health');assert.equal(options.headers,undefined);return Response.json({status:'ok'});
  }, undefined, {}).GET();
  check('health remains public without server key',()=>assert.equal(health.status,200));
  const Page = load('app/page.tsx').default;
  const html = moduleRequire('react-dom/server').renderToString(React.createElement(Page));
  check('initial render has no fake prediction',()=>{assert.ok(html.includes('결과 대기'));assert.ok(!html.includes('98.6'));assert.ok(!html.includes('DEMO-003'));});

  // Exercise the actual page handlers with a small hook harness, without a DOM dependency.
  const states=[], refs=[]; let stateIndex=0, refIndex=0, calls=[], failPrediction=false, lastPredictBody;
  const hooks={...React,useEffect:()=>{},useState:initial=>{
    const index=stateIndex++;if(!(index in states))states[index]=initial;
    return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value}];
  },useRef:initial=>{const index=refIndex++;return refs[index]??(refs[index]={current:initial})}};
  const InteractivePage=load('app/page.tsx',async(url,options)=>{calls.push(url); if(url==='/api/predict') lastPredictBody=JSON.parse(options.body); return failPrediction && url==='/api/predict' ? Response.json({error:'추론에 실패했습니다.'},{status:502}) : Response.json(url==='/api/sample'?sample:{...result, sample_id:lastPredictBody.sample_id})},hooks).default;
  const render=()=>{stateIndex=0;refIndex=0;return InteractivePage()};
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of React.Children.toArray(node.props?.children)) {const found=find(child,predicate);if(found)return found;}
    return null;
  }
  const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
  find(render(),node=>node.type==='select').props.onChange({target:{value:contract.SAMPLE_ID}});
  await flush();
  check('selection loads actual sample',()=>assert.deepEqual(JSON.parse(JSON.stringify(states[1])),sample.waveform));
  const waveformHtml = moduleRequire('react-dom/server').renderToString(render());
  check('actual waveform renders three deterministic integer-coordinate traces',()=>{
    const traces = [...waveformHtml.matchAll(/<polyline[^>]*points="([^"]+)"/g)];
    assert.equal(traces.length,3);
    for (const trace of traces) {
      const coordinates=trace[1].split(' ');
      assert.equal(coordinates.length,1000);
      for (const coordinate of coordinates) assert.match(coordinate,/^\d+,\d+$/);
    }
  });
  find(render(),node=>node.type==='button'&&node.props.className==='primary-button').props.onClick();
  await flush();
  check('page displays returned prediction',()=>assert.deepEqual(states[5],result));
  check('success triggers DB history refresh',()=>assert.equal(states[6],1));
  check('only sample and predict called by inference flow',()=>assert.deepEqual(calls,['/api/sample','/api/predict']));
  failPrediction=true;
  find(render(),node=>node.type==='button'&&node.props.className==='primary-button').props.onClick();
  await flush();
  check('failed prediction clears previous result and shows error',()=>{
    assert.equal(states[5],null);assert.equal(states[4],'추론에 실패했습니다.');assert.equal(states[6],1);
  });
  find(render(),node=>node.type==='select').props.onChange({target:{value:''}});
  await flush();
  check('reset removes input and result',()=>{assert.equal(states[1],null);assert.equal(states[5],null)});
  const customId='USER_JSON_001';
  const custom = {sample_id:customId,waveform:sample.waveform};
  for (const [name,value] of [['raw array',sample.waveform],['waveform object',custom]]) {
    check('parse '+name,()=>assert.deepEqual(JSON.parse(JSON.stringify(contract.parseWaveformJSON(JSON.stringify(value)).waveform)),sample.waveform));
  }
  for (const [name,text] of [
    ['NaN token','[[NaN,0,0]]'],['Infinity token','[[Infinity,0,0]]'],
    ['numeric overflow',JSON.stringify(Array.from({length:1000},()=>[0,1,2])).replace('0', '1e400')],
    ['null channel',JSON.stringify(Array.from({length:1000},()=>[0,null,0]))],
    ['numeric string',JSON.stringify(Array.from({length:1000},()=>['1',2,3]))],
    ['ragged rows',JSON.stringify([...sample.waveform.slice(0,999),[1,2]])],
    ['bad sample ID',JSON.stringify({...custom,sample_id:'../bad'})],
    ['oversized text',' '.repeat(contract.MAX_JSON_BYTES+1)],
  ]) check('reject JSON '+name,()=>assert.throws(()=>contract.parseWaveformJSON(text)));
  check('reject Infinity value',()=>assert.equal(contract.isWaveform(Array.from({length:1000},()=>[Infinity,0,0])),false));
  check('reject extra rows',()=>assert.equal(contract.isWaveform([...sample.waveform,[0,0,0]]),false));
  check('reject sparse channels',()=>assert.equal(contract.isWaveform(Array.from({length:1000},()=>Array(3))),false));
  const jsonProxy=load('app/api/predict/route.ts',async(url,options)=>{
    assert.deepEqual(JSON.parse(options.body),custom);
    return Response.json({...result,sample_id:customId});
  });
  const customResponse=await jsonProxy.POST(request({source:'json',...custom}));
  check('custom waveform forwarded unchanged',()=>assert.equal(customResponse.status,200));
  let called=false;
  const rejectProxy=load('app/api/predict/route.ts',async()=>{called=true;return Response.json(result)});
  for(const [name,body] of [
    ['short custom',{source:'json',...custom,waveform:sample.waveform.slice(1)}],
    ['bad custom ID',{source:'json',...custom,sample_id:'../bad'}],
    ['unknown source',{source:'microphone',...custom}],
  ]) { const response=await rejectProxy.POST(request(body));check(name,()=>assert.equal(response.status,422)); }
  const oversized=await rejectProxy.POST(new Request('http://localhost/api/predict',{method:'POST',body:' '.repeat(contract.MAX_JSON_BYTES+1)}));
  check('server body limit',()=>assert.equal(oversized.status,413));
  check('invalid inputs never reach FastAPI',()=>assert.equal(called,false));
  const mismatch=await load('app/api/predict/route.ts',async()=>Response.json(result)).POST(request({source:'json',...custom}));
  check('custom response ID mismatch rejected',()=>assert.equal(mismatch.status,502));

  failPrediction=false;
  find(render(),node=>node.type==='button'&&node.props.children==='JSON 붙여넣기').props.onClick();
  find(render(),node=>node.type==='textarea').props.onChange({target:{value:JSON.stringify(custom)}});
  check('editing leaves prediction disabled',()=>assert.equal(find(render(),node=>node.type==='button'&&node.props.className==='primary-button').props.disabled,true));
  find(render(),node=>node.type==='button'&&node.props.children==='JSON 검증 및 파형 표시').props.onClick();
  check('JSON validation enables prediction',()=>assert.equal(find(render(),node=>node.type==='button'&&node.props.className==='primary-button').props.disabled,false));
  find(render(),node=>node.type==='button'&&node.props.className==='primary-button').props.onClick();await flush();
  check('UI sends validated JSON waveform and displays custom result',()=>{assert.equal(lastPredictBody.source,'json');assert.deepEqual(lastPredictBody.waveform,sample.waveform);assert.equal(states[5].sample_id,customId)});
  find(render(),node=>node.type==='textarea').props.onChange({target:{value:'[]'}});
  check('editing invalidates previous waveform and result',()=>{assert.equal(states[1],null);assert.equal(states[5],null)});
  find(render(),node=>node.type==='button'&&node.props.children==='JSON 검증 및 파형 표시').props.onClick();
  check('invalid JSON shows Korean validation error',()=>assert.ok(states[4].includes('1000')));
  find(render(),node=>node.type==='textarea').props.onChange({target:{value:JSON.stringify(sample.waveform)}});
  find(render(),node=>node.type==='button'&&node.props.children==='JSON 검증 및 파형 표시').props.onClick();
  check('raw array receives auto-generated sample ID',()=>assert.match(states[0],/^JSON_[a-f0-9-]+$/));
  find(render(),node=>node.type==='button'&&node.props.children==='JSON 파일').props.onClick();
  const choose=async file=>{find(render(),node=>node.type==='input'&&node.props.type==='file').props.onChange({target:{files:[file],value:'selected'}});await flush()};
  await choose({name:'waveform.json',size:100000,text:async()=>JSON.stringify(custom)});
  check('JSON file is automatically validated',()=>{assert.equal(states[0],customId);assert.deepEqual(JSON.parse(JSON.stringify(states[1])),sample.waveform)});
  await choose({name:'bad.json',size:2,text:async()=>'[]'});
  check('bad file clears previous waveform',()=>{assert.equal(states[1],null);assert.ok(states[4].includes('1000'))});
  await choose({name:'waveform.txt',size:10,text:async()=>{throw Error('should not read')}});
  check('non-JSON file rejected',()=>assert.ok(states[4].includes('.json')));
  await choose({name:'large.json',size:contract.MAX_JSON_BYTES+1,text:async()=>{throw Error('should not read')}});
  check('oversized file rejected before reading',()=>assert.ok(states[4].includes('1 MiB')));
  await choose({name:'unreadable.json',size:10,text:async()=>{throw Error('unreadable')}});
  check('file read failure is Korean',()=>assert.ok(states[4].includes('파일을 읽지 못했습니다')));
  console.log(`${passed} checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1});
