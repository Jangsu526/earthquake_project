import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
const requireModule = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('PASS', name); }
function load(file, fetchImpl, hooks, serverEnv = { FASTAPI_API_KEY: "test-only-key" }) {
  const filename = path.resolve(root, file), exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'), {
    compilerOptions: { module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX, esModuleInterop:true },
  }).outputText, { exports, process: { env: serverEnv }, fetch:fetchImpl, Response, AbortController, AbortSignal, Error, TypeError, SyntaxError, setTimeout, clearTimeout,
    require:name => {
      if (name === 'react' && hooks) return hooks;
      if (!name.startsWith('.')) return requireModule(name);
      const target = path.resolve(path.dirname(filename),name);
      return load(target + (fs.existsSync(target+'.ts')?'.ts':'.tsx'), fetchImpl, hooks, serverEnv);
    },
  });
  return exports;
}
const row = (id=14) => ({id,sample_id:'JSON_history_sample',model_name:'proposed_v1',prediction_class:2,confidence:0.9919607043266296,created_at:'2026-10-09T10:46:18.335657'});
const payload = {count:2,predictions:[row(13),row(14)]};
const {parseHistory} = load('app/prediction-history-contract.ts');
const flush = () => new Promise(resolve=>setTimeout(resolve,0));
function harness(fetchImpl) {
  const states=[],effects=[];let index=0;
  const hooks={...React,useState:initial=>{const i=index++;if(!(i in states))states[i]=initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]},useEffect:fn=>effects.push(fn)};
  const Component=load('app/prediction-history.tsx',fetchImpl,hooks).default;
  const render=()=>{index=0;return Component()};
  return {states,effects,render,html:()=>requireModule('react-dom/server').renderToStaticMarkup(render())};
}
(async()=>{
  check('object envelope accepted and latest ID sorted first',()=>assert.equal(parseHistory(payload).predictions[0].id,14));
  check('empty object envelope accepted',()=>assert.equal(parseHistory({count:0,predictions:[]}).count,0));
  for(const [name,value] of [
    ['bare array',payload.predictions],['count mismatch',{...payload,count:3}],
    ['invalid class',{count:1,predictions:[{...row(),prediction_class:4}]}],
    ['invalid confidence',{count:1,predictions:[{...row(),confidence:Infinity}]}],
    ['missing timestamp',{count:1,predictions:[{...row(),created_at:undefined}]}],
    ['duplicate ID',{count:2,predictions:[row(),row()]}],
  ]) check('reject '+name,()=>assert.equal(parseHistory(value),null));
  const route=load('app/api/predictions/route.ts',async(url,options)=>{
    assert.equal(url,'http://localhost:8000/predictions?limit=10');assert.equal(options.cache,'no-store');assert.equal(options.headers['X-API-Key'],'test-only-key');return Response.json(payload);
  });
  const response=await route.GET();const body=await response.json();
  check('proxy preserves envelope and sorts latest first',()=>{assert.equal(response.status,200);assert.equal(body.count,2);assert.equal(body.predictions[0].id,14);assert.equal(response.headers.get('Cache-Control'),'no-store')});
  for(const [name,upstream,status] of [
    ['authentication failure',()=>Response.json({}, {status:401}),502],
    ['database failure',()=>Response.json({}, {status:503}),502],
    ['malformed envelope',()=>Response.json([]),502],
    ['invalid JSON',()=>new Response('{'),502],
    ['network failure',()=>{throw new TypeError('offline')},502],
    ['timeout',()=>{const error=new Error('timeout');error.name='TimeoutError';throw error},504],
  ]) {const result=await load('app/api/predictions/route.ts',async()=>upstream()).GET();check(name,()=>assert.equal(result.status,status))}
  let upstreamCalled=false;
  const denied=await load('app/api/predictions/route.ts',async()=>{upstreamCalled=true;return Response.json(payload)},undefined,{}).GET();
  check('missing server key prevents upstream history request',()=>{assert.equal(denied.status,502);assert.equal(upstreamCalled,false)});
  let calls=0;
  const fetchHistory=async(url,options)=>{calls++;assert.equal(url,'/api/predictions?limit=10');assert.equal(options.cache,'no-store');return Response.json(payload)};
  const first=harness(fetchHistory);
  check('initial loading state shown',()=>assert.ok(first.html().includes('DB 이력을 불러오는 중')));
  const cleanup=first.effects[0]();await flush();
  check('mount fetches DB rows and displays model and timestamp',()=>{assert.equal(first.states[0][0].id,14);const html=first.html();assert.ok(html.includes('proposed_v1'));assert.ok(html.includes('2026-10-09 10:46:18.335657'))});cleanup();
  const refreshed=harness(fetchHistory);refreshed.render();const cleanupRefresh=refreshed.effects[0]();await flush();
  check('fresh page mount reloads persisted rows',()=>{assert.equal(calls,2);assert.equal(refreshed.states[0][0].id,14)});cleanupRefresh();
  const empty=harness(async()=>Response.json({count:0,predictions:[]}));empty.render();const cleanEmpty=empty.effects[0]();await flush();
  check('empty state differs from loading',()=>{assert.ok(empty.html().includes('저장된 추론 이력이 없습니다.'));assert.equal(empty.states[1],false)});cleanEmpty();
  const failed=harness(async()=>Response.json({error:'DB 조회 실패'},{status:502}));failed.render();const cleanFailed=failed.effects[0]();await flush();
  check('error state includes retry and explains inference remains usable',()=>{const html=failed.html();assert.ok(html.includes('role="alert"'));assert.ok(html.includes('입력과 AI 추론은 계속'));assert.ok(html.includes('이력 새로고침'));assert.equal(failed.states[1],false)});cleanFailed();
  let resolveRequest;
  const cancelled=harness(()=>new Promise(resolve=>{resolveRequest=resolve}));cancelled.render();const cancel=cancelled.effects[0]();cancel();resolveRequest(Response.json(payload));await flush();
  check('unmounted request cannot overwrite a new history instance',()=>assert.equal(cancelled.states[0].length,0));
  console.log(`${passed} history checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1});
