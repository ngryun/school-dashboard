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
