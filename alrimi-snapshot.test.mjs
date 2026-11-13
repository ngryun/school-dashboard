import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeHistory, mergeMore, triple} from './scripts/fetch-alrimi.mjs';
import {summarize} from './scripts/alrimi-summary.mjs';

const row=(code,s,c,t,extra={})=>({SCHUL_CODE:code,SCHUL_NM:code+'학교',ADRCD_NM:'강원특별자치도 고성군',COL_S_SUM:s,COL_C_SUM:c,TEACH_CNT:t,...extra});

test('공시 이력은 이전 파일의 연도를 지우지 않고 새 연도를 덧붙인다',()=>{
 // 2026년 실행: OpenAPI가 주는 최근 3년(2024~2026)
 const first=mergeHistory(null,{'2024':[row('A',10,2,3),row('B',30,3,4)],'2025':[row('A',9,2,3),row('B',28,3,4)],'2026':[row('A',8,2,3)]},'2026');
 assert.deepEqual(first.years,['2024','2025','2026']);
 assert.deepEqual(first.schools.A,[[10,2,3],[9,2,3],[8,2,3]]);
 assert.deepEqual(first.schools.B,[[30,3,4],[28,3,4],null]);
 assert.deepEqual(first.gone,{B:['B학교','강원특별자치도 고성군']});
 // 2027년 실행: 2024년은 더 받을 수 없지만 이력에 남아 있어야 한다. 같은 연도는 새로 받은 값이 이긴다.
 const next=mergeHistory(first,{'2025':[row('A',9,2,3)],'2026':[row('A',7,2,3)],'2027':[row('A',6,1,2),row('C',5,1,1)]},'2027');
 assert.deepEqual(next.years,['2024','2025','2026','2027']);
 assert.deepEqual(next.schools.A,[[10,2,3],[9,2,3],[7,2,3],[6,1,2]]);
 assert.deepEqual(next.schools.B,[[30,3,4],[28,3,4],null,null]);
 assert.deepEqual(next.schools.C,[null,null,null,[5,1,1]]);
 assert.deepEqual(Object.keys(next.gone),['B']);
});

test('특수학교 총계 열과 추가 항목(전입·전출, 성별, 직원)을 학교코드로 묶는다',()=>{
 assert.deepEqual(triple({COL_SUM_S4:136,COL_SUM_C4:30,TEACH_CNT:40}),[136,30,40]);
 const more=mergeMore({'10':[{SCHUL_CODE:'A',MVIN_SUM:5,MVT_SUM:10}],'63':[{SCHUL_CODE:'A',COL_MSUM:29,COL_WSUM:23},{SCHUL_CODE:'S',COL_MSUM4:100,COL_WSUM4:36}],'68':[{SCHUL_CODE:'A',SUM_1:4,SUM_2:0,SUM_3:9}]});
 assert.deepEqual(more.A,[5,10,29,23,4,0,9]);
 assert.deepEqual(more.S,[null,null,100,36,null,null,null]);
});

test('요약은 연도별 합계에 그해 학생이 있던 폐교도 넣고 전입·전출·성별 합계를 낸다',()=>{
 const data={year:'2026',students:[row('A',8,2,3,{COL_S1:1})],history:{years:['2024','2026'],schools:{A:[[10,2,3],[8,2,3]],B:[[30,3,4],null],Z:[[0,0,0],[0,0,0]]}},more:{years:{'10':'2026','63':'2026'},schools:{A:[5,10,4,4,null,null,null]}}};
 const s=summarize(data,'02');
 assert.deepEqual(s.trend,{'2024':{schools:2,students:40,classes:5,teachers:7},'2026':{schools:1,students:8,classes:2,teachers:3}});
 assert.equal(s.moveIn,5);assert.equal(s.moveOut,10);assert.equal(s.male,4);assert.equal(s.small,1);
 // 이력·추가 항목이 없는 예전 파일도 그대로 요약된다.
 assert.equal(summarize({year:'2026',students:[row('A',8,2,3)]},'05').trend,undefined);
});
