import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSessionToken,scenarioMetadata} from '../utils/livekit-token.ts';
const env={LIVEKIT_API_KEY:'test',LIVEKIT_API_SECRET:'12345678901234567890123456789012',LIVEKIT_URL:'wss://test.invalid'};
const ids=['rh-product-manager','rh-sales','manager-product','tech-frontend','behavior-star','final-director','salary-negotiation'];
for(const id of ids) test(id+' dispatches recruitment agent',async()=>{
 const {token}=await createSessionToken({identity:'test',room:`room_recruiter-${id}_session-test_attempt-1`},env);
 const body=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));
 assert.equal(body.roomConfig.agents[0].agentName,'recruitment-agent');
});
const custom={id:'custom-test',name:'Sophie',role:'RH',position:'Responsable logistique',systemInstruction:'Contexte spécifique : livraison par cargo',voiceName:'Aoede'};
test('custom metadata preserves context',()=>assert.deepEqual(JSON.parse(scenarioMetadata('room_recruiter-custom-test_session-test',custom)).scenario,custom));
test('rejects missing, mismatched, oversize and unknown scenarios',()=>{
 for(const [room,scenario] of [['room_recruiter-custom-test_session-test',null],['room_recruiter-custom-other_session-test',custom],['room_recruiter-custom-test_session-test',{...custom,systemInstruction:'a'.repeat(13000)}],['room_recruiter-unknown_session-test',null]]) assert.throws(()=>scenarioMetadata(room,scenario));
});
