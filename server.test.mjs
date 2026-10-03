import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchRows } from './server.mjs';
const response=data=>({ok:true,json:async()=>data});
test('학교 목록 페이지를 모두 취합하고 인증키는 NEIS에만 전달한다',async()=>{
 const urls=[];
 const rows=await fetchRows('schoolInfo',{ATPT_OFCDC_SC_CODE:'K10',unexpected:'drop'},'test-key',async u=>{urls.push(u);return response({schoolInfo:[{head:[{list_total_count:1001},{RESULT:{CODE:'INFO-000'}}]},{row:urls.length===1?Array.from({length:1000},(_,id)=>({id})):[{id:1000}]}]});});
 assert.equal(rows.length,1001);assert.equal(urls.length,2);assert.equal(urls[1].searchParams.get('pIndex'),'2');assert.equal(urls[0].hostname,'open.neis.go.kr');assert.equal(urls[0].searchParams.get('KEY'),'test-key');assert.equal(urls[0].searchParams.has('unexpected'),false);
});
test('공개 일정이 없는 경우 빈 결과를 반환한다',async()=>assert.deepEqual(await fetchRows('SchoolSchedule',{},'key',async()=>response({RESULT:{CODE:'INFO-200'}})),[]));
test('인증 오류를 일정 없음으로 처리하지 않는다',async()=>assert.rejects(()=>fetchRows('SchoolSchedule',{},'key',async()=>response({RESULT:{CODE:'ERROR-290'}})),/ERROR-290/));
test('잘못된 응답을 거부한다',async()=>assert.rejects(()=>fetchRows('spsTimetable',{},'key',async()=>response({unknown:[]})),/응답 형식/));
test('NEIS 서버 오류를 전달한다',async()=>assert.rejects(()=>fetchRows('schoolInfo',{},'key',async()=>({ok:false})),/연결할 수 없습니다/));
import { fetchAlrimi, validateAlrimi } from './server.mjs';
test('학교알리미 응답을 정규화하고 인증키는 학교알리미에만 전달한다',async()=>{
 const urls=[];
 const r=await fetchAlrimi('09',{sido:'51',sgg:'51820',kind:'02',year:'2026'},'alrimi-key',async u=>{urls.push(u);return response({resultCode:'success',resultMsg:'',list:[{SCHUL_NM:'간성초등학교',COL_S_SUM:'1,234'}]});});
 assert.equal(r.rows.length,1);assert.equal(urls[0].hostname,'www.schoolinfo.go.kr');assert.equal(urls[0].searchParams.get('apiKey'),'alrimi-key');assert.equal(urls[0].searchParams.get('pbanYr'),'2026');assert.equal(urls[0].searchParams.get('sggCode'),'51820');
});
test('학교알리미 인증 오류와 자료 없음을 구분한다',async()=>{
 await assert.rejects(()=>fetchAlrimi('09',{sido:'51',kind:'02'},'bad',async()=>response({resultCode:'fail',resultMsg:'유효하지 않은 apiKey입니다.'})),/인증키/);
 const r=await fetchAlrimi('09',{sido:'51',kind:'02'},'k',async()=>response({resultCode:'fail',resultMsg:'데이터가 없습니다.'}));
 assert.deepEqual(r.rows,[]);assert.match(r.message,/데이터/);
});
test('학교알리미 요청 인자를 검증한다',()=>{
 assert.equal(validateAlrimi('09',{sido:'51',sgg:'51820',kind:'02',year:'2026'}),null);
 assert.match(validateAlrimi('99',{sido:'51',kind:'02'}),/항목/);
 assert.match(validateAlrimi('09',{sido:'5',kind:'02'}),/시도/);
 assert.match(validateAlrimi('09',{sido:'51',kind:'1'}),/학교급/);
});
