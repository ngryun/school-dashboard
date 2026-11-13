import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// 브라우저 진입 코드를 제외하고 실제 조회·캐시·표시 함수를 실행한다.
// DOM은 입력/출력 경계만 대체하고 비동기 조회와 취소 순서는 그대로 검증한다.
const source=(await readFile(new URL('./public/app.js',import.meta.url),'utf8'))
 .replace(/^import .*;\n/gm,'').split('const initialUrl=readUrl();')[0];
const school={SD_SCHUL_CODE:'7800001',ATPT_OFCDC_SC_CODE:'K10',SCHUL_NM:'테스트초등학교',SCHUL_KND_SC_NM:'초등학교',ORG_RDNMA:'강원특별자치도 고성군 테스트로 1'};
function app(fetcher=async()=>({ok:true,json:async()=>({rows:[]})})){
 const nodes=new Map();
 const node=key=>{if(!nodes.has(key))nodes.set(key,{value:'',textContent:'',innerHTML:'',hidden:false,dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},setAttribute(){},focus(){},querySelector(){return null;},querySelectorAll(){return [];}});return nodes.get(key);};
 const context=vm.createContext({config:{},school,fetch:fetcher,AbortController,AbortSignal,URLSearchParams,URL,setTimeout,clearTimeout,Date,writes:[],localStorage:{getItem(){return null;},setItem(){}},window:{addEventListener(){},scrollTo(){}},location:{hash:'',pathname:'/'},document:{querySelector:node,querySelectorAll(){return [];},addEventListener(){}}});
 const run=code=>vm.runInContext(code,context);
 run(source);
 run("render=()=>{};renderDistricts=()=>{};renderBasis=()=>{};loadAlrimi=async()=>{};store.get=async()=>null;store.set=(key,value)=>writes.push({key,value});state.demo=false;state.loadedDistrict='고성군';state.schools=[school];state.allSchools=[school];");
 return {run,nodes,state:run('state'),context};
}
const ok=rows=>({ok:true,json:async()=>({rows})});

test('새로고침은 일정과 학급의 메모리 캐시를 모두 갱신한다',async()=>{
 const calls=[];
 const a=app(async url=>{calls.push(url);return ok(url.startsWith('api/classInfo')?[{GRADE:'1',CLASS_NM:'1'},{GRADE:'2',CLASS_NM:'1'}]:[{...school,AA_YMD:'20261110',EVENT_NM:'새 일정'}]);});
 a.run("classCache.set(classKey(school),{total:99});eventCache.set(school.ATPT_OFCDC_SC_CODE+school.SD_SCHUL_CODE+ymd(state.month),[{EVENT_NM:'옛 일정'}]);");
 await a.run('loadEvents(true)');
 assert.equal(calls.length,2);
 assert.equal(a.run('classTotal(school)'),2);
 assert.equal(a.state.events[0].EVENT_NM,'새 일정');
 assert.equal(a.context.writes[0].value.schoolCodes,school.SD_SCHUL_CODE);
});

test('학교 구성이나 학년도가 바뀌면 이전 지역 저장본을 사용하지 않는다',async()=>{
 for(const change of ["schoolCodes:'폐교코드',academicYear:ay()", "schoolCodes:school.SD_SCHUL_CODE,academicYear:'2000'"]){
  let calls=0;const a=app(async()=>{calls++;return ok([]);});
  a.run(`store.get=async()=>({at:Date.now(),${change},events:[{EVENT_NM:'옛 일정'}],classes:[]});`);
  await a.run('loadEvents()');
  assert.equal(calls,2);assert.equal(a.state.events.length,0);
 }
});

test('같은 학교 구성과 학년도의 저장본은 API 호출 없이 복원한다',async()=>{
 const a=app(async()=>{throw new Error('저장본을 쓰면 호출하지 않아야 합니다.');});
 a.run("store.get=async()=>({at:Date.now(),schoolCodes:school.SD_SCHUL_CODE,academicYear:ay(),events:[{...school,EVENT_NM:'저장 일정'}],classes:[[classKey(school),{total:6}]]});");
 await a.run('loadEvents()');
 assert.equal(a.state.events[0].EVENT_NM,'저장 일정');assert.equal(a.run('classTotal(school)'),6);
});

test('일정 조회 실패를 학교 카드와 표에 0건으로 표시하지 않는다',async()=>{
 const a=app(async url=>url.startsWith('api/SchoolSchedule')?{ok:false,json:async()=>({error:'일시 오류'})}:ok([]));
 await a.run('loadEvents()');
 assert.equal(a.state.failures,1);assert.equal(a.state.failedSchools.has(school.SD_SCHUL_CODE),true);
 assert.match(a.run('schoolCard(school,new Map(),false)'),/일정 조회에 실패/);
 assert.match(a.run('schoolTable([school],false,()=>0,true)'),/조회 실패/);
 assert.equal(a.context.writes.length,0);
});

test('학급 조회가 실패한 묶음을 완료된 영구 캐시로 저장하지 않는다',async()=>{
 const a=app(async url=>{if(url.startsWith('api/classInfo'))throw new Error('학급 조회 실패');return ok([]);});
 await a.run('loadEvents()');assert.equal(a.context.writes.length,0);
});

test('조회 중단 뒤 늦게 도착한 응답은 결과와 캐시에 반영하지 않는다',async()=>{
 let resolve,started;const began=new Promise(r=>started=r);
 const a=app(async()=>{started();return new Promise(r=>resolve=r);});
 const pending=a.run('loadEvents()');await began;
 a.nodes.get('#cancel-load').onclick();resolve(ok([{EVENT_NM:'취소 뒤 도착'}]));await pending;
 assert.equal(a.state.busy,false);assert.equal(a.state.eventsLoaded,false);assert.equal(a.state.events.length,0);
 assert.equal(a.run('eventCache.size'),0);assert.equal(a.context.writes.length,0);
 assert.match(a.nodes.get('#notice').textContent,/중단/);
});

test('학사일정 미조회와 실패를 학교 상세창에서 구분한다',()=>{
 const a=app();a.run("showDetail=html=>{captured=html;};schoolDetail(school.SD_SCHUL_CODE);");
 assert.match(a.run('captured'),/아직 조회하지 않았습니다/);assert.match(a.run('captured'),/미확인/);
 a.run('state.eventsLoaded=true;state.failedSchools.add(school.SD_SCHUL_CODE);schoolDetail(school.SD_SCHUL_CODE);');
 assert.match(a.run('captured'),/이 학교의 일정 조회에 실패/);
});

test('공시 조회 이력은 교육청별로 분리한다',()=>{
 const a=app();a.run("alrimiTried.set('K10||02',0);");
 assert.equal(a.run('alrimiAttempted(school)'),true);
 assert.equal(a.run("alrimiAttempted({...school,ATPT_OFCDC_SC_CODE:'S10'})"),false);
});

test('학교 검색은 띄어쓰기와 영문 대소문자를 정규화한다',()=>{
 const a=app();a.state.query='테스트 초등학교';assert.equal(a.run('schools().length'),1);
 a.state.query='ABC';assert.equal(a.run("matchesQuery(['abc 학교'])"),true);
});


test('잘못된 공유 링크의 프로토타입 속성을 화면이나 교육청으로 사용하지 않는다',()=>{
 const a=app();a.context.location.hash='#view=constructor&office=__proto__';
 assert.equal(a.run('readUrl().view'),'overview');assert.equal(a.run('readUrl().office'),'');
});


test('일부 학교가 실패해도 성공한 다른 학교의 빈 일정을 실패로 표시하지 않는다',()=>{
 const a=app();a.state.failures=1;
 assert.doesNotMatch(a.run('eventTable([])'),/조회가 실패/);
 assert.match(a.run('eventTable([],true)'),/조회가 실패/);
});


test('학사일정은 토요휴업일만 제외하고 공휴일과 토요일 실제 행사를 유지한다',()=>{
 const a=app();
 a.state.events=['토요휴업일',' 토요 휴업일 ','한글날','토요 체험학습'].map(EVENT_NM=>({...school,AA_YMD:'20261107',EVENT_NM}));
 assert.deepEqual(Array.from(a.run('events()'),e=>e.EVENT_NM),['한글날','토요 체험학습']);
 a.run("showDetail=html=>{captured=html;};state.eventsLoaded=true;schoolDetail(school.SD_SCHUL_CODE);");
 assert.doesNotMatch(a.run('captured'),/토요휴업일|토요 휴업일/);
 assert.match(a.run('captured'),/한글날/);
 assert.equal(a.state.events.length,4); // 원본·기존 캐시의 일정 인덱스는 유지한다.
});

test('학생 증감은 폐교·통합된 학교의 기준 연도 학생 수를 그 시·군·구에만 더한다',()=>{
 const a=app();
 a.run(`const tr=(x,y)=>[{year:'2024',students:x,classes:1,teachers:1},{year:'2026',students:y,classes:1,teachers:1}];
  alrimiStats.set(school.SD_SCHUL_CODE,{students:80,trend:tr(100,80),more:{moveIn:5,moveOut:9}});
  alrimiGone.set('K10|S1',{name:'폐교초',addr:['강원특별자치도','고성군'],type:'초등학교',trend:[{year:'2024',students:20,classes:1,teachers:1}]});
  alrimiGone.set('K10|S2',{name:'다른군초',addr:['강원특별자치도','양양군'],type:'초등학교',trend:[{year:'2024',students:50,classes:1,teachers:1}]});
  alrimiGone.set('K10|S3',{name:'폐교중',addr:['강원특별자치도','고성군'],type:'중학교',trend:[{year:'2024',students:40,classes:1,teachers:1}]});
  state.loadedOffice='K10';`);
 const pick=code=>JSON.parse(a.run(`JSON.stringify(${code})`));
 assert.deepEqual(pick('changeOf([school])'),{base:'2024',latest:'2026',then:100,now:80,delta:-20,rate:-0.2});
 assert.equal(pick("changeOf([school],'고성군')").then,120);
 assert.equal(pick('changeOf([school],null)').then,170);
 assert.deepEqual(pick('moveOf([school])'),{moveIn:5,moveOut:9,net:-4,n:1});
 assert.equal(a.run('signedPct(-0.2)'),'−20.0%');assert.equal(a.run('signed(1200)'),'+1,200');
 // CSV의 음수 증감률은 숫자로 남기고, 수식처럼 보이는 글자만 막는다.
 assert.equal(a.run("csvCell('-20.0')"),'"-20.0"');assert.equal(a.run("csvCell('-1+2')"),'"\'-1+2"');assert.equal(a.run("csvCell('=A1')"),'"\'=A1"');
 // 이력이 한 해뿐이거나 없으면(중계 모드) 증감을 내지 않는다.
 a.run("alrimiStats.set(school.SD_SCHUL_CODE,{students:80,trend:[{year:'2026',students:80}]})");
 assert.equal(a.run('changeOf([school])'),null);assert.equal(a.run('moveOf([school])'),null);
});
