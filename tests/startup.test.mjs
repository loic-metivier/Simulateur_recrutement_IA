import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {EventEmitter} from 'node:events';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function harness({custom=false,rejectTracking=false,microphoneFailure=false}={}) {
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,checked:false,dataset:{},childNodes:[{}],classList:{toggle(){}},setAttribute(){},textContent:''});return nodes.get(id)};
 let room,request; const timers=new Map();
 class Room extends EventEmitter {
  constructor(){super();room=this;this.canPlaybackAudio=true;this.localParticipant={setMicrophoneEnabled:async()=>{if(microphoneFailure)throw Object.assign(new Error('Denied'),{name:'NotAllowedError'})}};}
  startAudio(){return Promise.resolve()} connect(){return Promise.resolve()} disconnect(){this.disconnected=true;return Promise.resolve()}
 }
 const state={scenario:{id:custom?'custom-test':'rh-sales',person:'Sophie',role:'RH',position:'Logistique',level:'Senior',context:'Cyclovia cargo',questions:['Parcours ?'],initials:'SL'},sessionId:'test',responseMode:'voice'};
 const ctx={state,$,LivekitClient:{Room,RoomEvent:Object.fromEntries(['AudioPlaybackStatusChanged','Disconnected','ParticipantDisconnected','TrackSubscribed','TrackUnsubscribed','DataReceived','ActiveSpeakersChanged'].map(x=>[x,x]))},AbortController,TextDecoder,crypto:{randomUUID:()=> 'attempt'},document:{querySelectorAll:()=>[],body:{appendChild(){}}},setTimeout:(f)=>{const id=Symbol();timers.set(id,f);return id},clearTimeout:id=>timers.delete(id),setInterval:()=>1,clearInterviewTimers(){},navigate:view=>state.view=view,setConversationState:value=>state.conversationState=value,logSessionAction(){},firebase:{firestore:{FieldValue:{serverTimestamp:()=>0}}},db:{collection:()=>({doc:()=>({set:()=>rejectTracking?Promise.reject(Error('tracking denied')):Promise.resolve()})})},fetch:async(url,opts)=>{request=JSON.parse(opts.body);return {ok:true,json:async()=>({token:'token',serverUrl:'wss://test'})}},formatTime(){},addTranscript(){}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('  function stopConnection()'),source.indexOf('  function askCurrentQuestion()')),ctx);
 return {ctx,state,$,timers,get room(){return room},get request(){return request}};
}
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
for(const custom of [false,true])test('startup waits for agent; analytics failure harmless; custom='+custom,async()=>{
 const h=harness({custom,rejectTracking:true});const done=h.ctx.startInterview();await flush();
 assert.equal(h.state.conversationState,'connecting');assert.equal(h.request.scenario?.systemInstruction.includes('Cyclovia'),custom?true:undefined);
 h.room.emit('DataReceived',new TextEncoder().encode('{"type":"agent_ready"}'),{isAgent:false});await flush();assert.equal(h.state.agentReady,false);
 h.room.emit('DataReceived',new TextEncoder().encode('{"type":"agent_ready"}'),{isAgent:true});await done;assert.equal(h.state.conversationState,'user-ready');h.ctx.stopConnection();assert.equal(h.room.disconnected,true);
});
test('agent failure disconnects and returns visible error',async()=>{const h=harness();const done=h.ctx.startInterview();await flush();h.room.emit('DataReceived',new TextEncoder().encode('{"type":"agent_error","message":"Indisponible"}'),{isAgent:true});await done;assert.equal(h.state.view,'prep');assert.equal(h.$('#connection-error').textContent,'Indisponible');assert.equal(h.room.disconnected,true)});
test('startup timeout disconnects',async()=>{const h=harness();const done=h.ctx.startInterview();await flush();[...h.timers.values()][0]();await done;assert.equal(h.state.view,'prep');assert.equal(h.room.disconnected,true)});
test('microphone denied cleans up connected room',async()=>{const h=harness({microphoneFailure:true});await h.ctx.startInterview();assert.equal(h.state.view,'prep');assert.match(h.$('#connection-error').textContent,/microphone/);assert.equal(h.room.disconnected,true)});
function microphoneHarness(request) {
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id)};
 const state={voiceMicReady:false};let timeout;
 const ctx={state,$,navigator:{mediaDevices:{getUserMedia:()=>request}},setTimeout:f=>(timeout=f,1),clearTimeout(){},updatePreflight(){}};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('  async function testMicrophone()'),source.indexOf('  function formatTime',source.indexOf('  async function testMicrophone()'))),ctx);
 return {ctx,state,$,expire:()=>timeout()};
}
test('microphone test releases capture after success',async()=>{let stopped=false;const track={readyState:'live',stop:()=>stopped=true};const h=microphoneHarness(Promise.resolve({getAudioTracks:()=>[track],getTracks:()=>[track]}));await h.ctx.testMicrophone();assert.equal(h.state.voiceMicReady,true);assert.equal(stopped,true)});
test('microphone denial cannot mark it ready',async()=>{const h=microphoneHarness(Promise.reject(Object.assign(Error('denied'),{name:'NotAllowedError'})));await h.ctx.testMicrophone();assert.equal(h.state.voiceMicReady,false);assert.match(h.$('#mic-status-copy').textContent,/refusé/)});
test('late microphone permission is released after timeout',async()=>{let resolve,stopped=false;const h=microphoneHarness(new Promise(r=>resolve=r));const done=h.ctx.testMicrophone();h.expire();await done;resolve({getTracks:()=>[{stop:()=>stopped=true}]});await flush();assert.equal(stopped,true);assert.equal(h.state.voiceMicReady,false)});
