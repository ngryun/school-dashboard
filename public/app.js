import { fetchRows } from './neis.mjs';
import { config } from './config.js';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=name=>'<svg class="i" aria-hidden="true"><use href="#i-'+name+'"/></svg>';
// --- 차트 부품 (라이브러리 없음, 인라인 SVG). CSP 때문에 색은 클래스, 길이는 SVG 속성으로만 표현한다.
const pct=(n,total)=>total?Math.round(n/total*1000)/10:0;
function donutChart({segments,center,sub,size=152,stroke=18,label,legend=true}){
 const total=segments.reduce((a,s)=>a+(s.value||0),0),r=(size-stroke)/2,c=2*Math.PI*r,live=segments.filter(s=>s.value>0),gap=live.length>1?2.5:0;let offset=0;
 const arcs=live.map(s=>{const len=Math.max(0,c*s.value/total-gap),el=`<circle class="donut-seg ${esc(s.cls)}" r="${r}" cx="${size/2}" cy="${size/2}" stroke-width="${stroke}" stroke-dasharray="${len.toFixed(2)} ${(c-len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" tabindex="0"><title>${esc(s.label)} ${fmt(s.value)} (${pct(s.value,total)}%)</title></circle>`;offset+=len+gap;return el;});
 return `<div class="donut"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label||'')}"><g transform="rotate(-90 ${size/2} ${size/2})">${total?arcs.join(''):`<circle class="donut-track" r="${r}" cx="${size/2}" cy="${size/2}" stroke-width="${stroke}"/>`}</g><text x="50%" y="47%" class="donut-value" text-anchor="middle">${esc(center)}</text><text x="50%" y="63%" class="donut-sub" text-anchor="middle">${esc(sub||'')}</text></svg>${legend?`<ul class="legend-list">${segments.map(s=>`<li class="${s.value?'':'is-zero'}"><span class="swatch ${esc(s.cls)}"></span><span class="lg-label">${esc(s.label)}</span><b>${fmt(s.value)}</b><small>${total&&s.value?pct(s.value,total)+'%':'—'}</small></li>`).join('')}</ul>`:''}</div>`;
}
function barChart({rows,unit='',cls='accent',max,cols=1}){
 const top=max||Math.max(1,...rows.map(r=>r.value||0));
 return `<div class="bars${cols>1?' cols-2':''}">${rows.map(r=>{const w=r.value>0?Math.max(1.2,r.value/top*100):0,c=esc(r.cls||(r.muted?'neutral':cls));return `<div class="bar-row${r.muted?' is-muted':''}" title="${esc(r.label)} ${fmt(r.value)}${esc(unit)}${r.hint?' · '+esc(r.hint):''}"><span class="bar-label">${esc(r.label)}</span><svg class="bar-track" height="8" width="100%" aria-hidden="true"><line class="bar-axis" x1="0.5" y1="0" x2="0.5" y2="8"/>${w?`<rect class="bar-fill ${c}" width="${w.toFixed(1)}%" height="8" rx="3"/><rect class="bar-fill ${c}" width="3" height="8"/>`:''}</svg><b class="bar-value">${fmt(r.value)}<small>${esc(unit)}</small></b></div>`;}).join('')}</div>`;
}
// span: 12칸 격자에서 차지하는 칸 수(한눈에 보기·시도교육청 화면 공통).
function chartCard({title,caption,body,note,wide,span}){return `<article class="chart-card span-${span||(wide?12:4)}"><header><h3>${esc(title)}</h3>${caption?`<span>${esc(caption)}</span>`:''}</header>${body}${note?`<footer>${note}</footer>`:''}</article>`;}
const kpiCell=(label,value,unit,sub)=>`<div class="kpi"><span class="kpi-label">${label}</span><strong>${value}${value!=='—'&&unit?`<small>${unit}</small>`:''}</strong><span class="kpi-sub">${sub||''}</span></div>`;
const chartEmpty=(text,iconName='calendar')=>`<div class="chart-empty">${icon(iconName)}<p>${esc(text)}</p></div>`;

const offices={B10:'서울특별시교육청',C10:'부산광역시교육청',D10:'대구광역시교육청',E10:'인천광역시교육청',F10:'광주광역시교육청',G10:'대전광역시교육청',H10:'울산광역시교육청',I10:'세종특별자치시교육청',J10:'경기도교육청',K10:'강원특별자치도교육청',M10:'충청북도교육청',N10:'충청남도교육청',P10:'전북특별자치도교육청',Q10:'전라남도교육청',R10:'경상북도교육청',S10:'경상남도교육청',T10:'제주특별자치도교육청'};
const types=['전체','초등학교','중학교','고등학교','특수학교'];
const color=t=>({'초등학교':'elementary','중학교':'middle','고등학교':'high','특수학교':'special'}[t]||'');
const gangwonDistricts=['춘천시','원주시','강릉시','동해시','태백시','속초시','삼척시','홍천군','횡성군','영월군','평창군','정선군','철원군','화천군','양구군','인제군','고성군','양양군'];
const districtOf=s=>{const parts=(s.ORG_RDNMA||'').trim().split(/\s+/);return s.ATPT_OFCDC_SC_CODE==='I10'?'세종시':parts[1]||'지역 미분류';};
let scheduleController=null;
let mode='server';
const direct={key:'',shared:String(config?.key||'')};
const activeKey=()=>direct.key||direct.shared;
try{direct.key=localStorage.getItem('neisKey')||'';}catch{}
const eventCache=new Map();
const classCache=new Map();
const ay=()=>String(now.getMonth()+1>=3?now.getFullYear():now.getFullYear()-1);
const classKey=s=>s.ATPT_OFCDC_SC_CODE+s.SD_SCHUL_CODE+ay();
const classTotal=s=>classCache.get(classKey(s))?.total;
// 학년별 막대 라벨: 특수학교처럼 과정(초·중·고·전공과)이 여럿이면 과정+학년(초1·고3)으로 나눈다.
const courseOrder=['유치원','초등학교','중학교','고등학교'],courseShort={'유치원':'유','초등학교':'초','중학교':'중','고등학교':'고'};
function summarizeClasses(rows){const byGrade=new Map();for(const r of rows){const g=r.GRADE||'기타';const info=byGrade.get(g)||{count:0,names:[],tracks:new Set()};info.count++;info.names.push(String(r.CLASS_NM??''));const t=[r.ORD_SC_NM,r.DDDEP_NM].filter(x=>x&&!['일반계','일반학과','공통과정'].includes(x)).join(' · ');if(t)info.tracks.add(t);byGrade.set(g,info);}for(const info of byGrade.values())info.names.sort((a,b)=>a.localeCompare(b,'ko',{numeric:true}));
 const multi=new Set(rows.map(r=>r.SCHUL_CRSE_SC_NM).filter(Boolean)).size>1,bars=new Map();
 for(const r of rows){const course=r.SCHUL_CRSE_SC_NM||'',g=String(r.GRADE||'기타'),label=multi?(courseShort[course]?courseShort[course]+g:course.replace(/과$/,'')||g):g==='기타'?'기타':g+'학년',ci=courseOrder.indexOf(course);const bar=bars.get(label)||{label,count:0,order:(ci<0?9:ci)*100+(Number(g)||99)};bar.count++;bars.set(label,bar);}
 return {total:rows.length?rows.length:null,byGrade,bars:[...bars.values()].sort((a,b)=>a.order-b.order)};}
const alrimiCache=new Map(),alrimiStats=new Map(),alrimiStaff=new Map(),alrimiTried=new Map();let alrimiError='',alrimiReady=null,alrimiProbe=null,regionsPromise=null,sidoWide=null;
const kindCodes={'초등학교':'02','중학교':'03','고등학교':'04','특수학교':'05'};
const alrimiBase=()=>mode==='direct'?String(config?.apiBase||'').replace(/\/+$/,''):'';
// 학교알리미 공시 스냅숏(public/alrimi/, npm run fetch:alrimi로 국내에서 수집해 커밋)이 있으면 중계 서버보다 먼저 쓴다.
// 학교알리미가 Cloudflare 등 해외 클라우드 접속을 대부분 끊어 Worker 실시간 중계가 불안정했기 때문이다.
let snapshotIndex=null,snapshotPromise=null;const snapshotFiles=new Map();
const alrimiSnapshot=()=>snapshotPromise??=fetch('alrimi/index.json',{cache:'no-cache'}).then(r=>r.ok&&(r.headers.get('content-type')||'').includes('json')?r.json():null).then(d=>snapshotIndex=d?.files?d:null).catch(()=>null);
async function snapshotRows(apiType,sido,kind){
 const id=sido+'-'+kind;if(!snapshotIndex?.files?.[id])return {rows:[],year:'',noData:true};
 if(!snapshotFiles.has(id))snapshotFiles.set(id,fetch('alrimi/'+id+'.json').then(r=>{if(!r.ok)throw new Error('학교알리미 공시 자료 파일을 불러오지 못했습니다.');return r.json();}).catch(error=>{snapshotFiles.delete(id);throw error;}));
 const data=await snapshotFiles.get(id);return apiType==='22'?{rows:data.staff||[],year:data.staffYear||data.year}:{rows:data.students||[],year:data.year};
}
const alrimiEnabled=()=>!!snapshotIndex||mode==='server'||!!alrimiBase();
const regionsData=()=>regionsPromise??=fetch('regions.json').then(r=>{if(!r.ok)throw new Error('regions');return r.json();}).catch(()=>{regionsPromise=null;return {};});
const sidoNameOf=office=>(offices[office]||'').replace(/교육청$/,'');
function sggCodesFor(regions,office,district){const region=regions[sidoNameOf(office)];if(!region)return {sido:'',codes:[]};const sgg=region.sgg;if(office==='I10')return {sido:region.code,codes:Object.values(sgg).slice(0,1)};if(!district)return {sido:region.code,codes:[]};if(sgg[district]){const children=Object.entries(sgg).filter(([n])=>n.startsWith(district+' ')).map(([,c])=>c);return {sido:region.code,codes:children.length?children:[sgg[district]]};}return {sido:region.code,codes:Object.entries(sgg).filter(([n])=>n.startsWith(district)).map(([,c])=>c)};}
const num=v=>{if(v==null)return null;const t=String(v).trim().replace(/,/g,'');if(!t||t==='-')return null;const n=Number(t);return Number.isFinite(n)?n:null;};
const pick=(r,...keys)=>{for(const k of keys){const n=num(r[k]);if(n!=null)return n;}return null;};
const normName=s=>String(s||'').replace(/\s+/g,'');
const fmt=n=>n==null?'—':n.toLocaleString('ko-KR');
// 학교알리미 09 열 배치(OpenAPI 출력값 정의서): 초·중·고는 C1~C6 학년, C7 특수학급, C8 순회학급.
// 특수학교는 C1 유치원, C2~C7 초1~6, C8~C10 중1~3, C11~C13 고1~3, C14 전공과, C15~C18 과정별 순회학급. [전체 이름, 막대 라벨, 열 번호, 학년 여부]
const regularCols=[['1학년','1학년',1,1],['2학년','2학년',2,1],['3학년','3학년',3,1],['4학년','4학년',4,1],['5학년','5학년',5,1],['6학년','6학년',6,1],['특수학급','특수',7,0],['순회학급','순회',8,0]];
const specialCols=[['유치원','유',1,1],['유치원 순회학급','유순회',15,0],...[1,2,3,4,5,6].map(g=>['초등부 '+g+'학년','초'+g,g+1,1]),['초등부 순회학급','초순회',16,0],...[1,2,3].map(g=>['중등부 '+g+'학년','중'+g,g+7,1]),['중등부 순회학급','중순회',17,0],...[1,2,3].map(g=>['고등부 '+g+'학년','고'+g,g+10,1]),['고등부 순회학급','고순회',18,0],['전공과','전공',14,1]];
function parseStudents(r){const grades=[],kind=String(r.SCHUL_KND_SC_CODE),span=kind==='02'?6:3;for(const [label,short,i,isGrade] of (kind==='05'?specialCols:regularCols)){const c=num(r['COL_C'+i]),s=num(r['COL_S'+i]),keep=kind!=='05'&&isGrade&&i<=span;if(c||s||keep)grades.push({label,short,isGrade:!!isGrade,classes:c??(keep?0:null),students:s??(keep?0:null),perClass:num(r['COL_'+i])});}return {students:pick(r,'COL_S_SUM','COL_SUM_S4'),classes:pick(r,'COL_C_SUM','COL_SUM_C4'),perClass:pick(r,'COL_SUM','COL_SUM_4'),teachers:num(r.TEACH_CNT),perTeacher:num(r.TEACH_CAL),grades,code:String(r.SCHUL_CODE||'')};}
const staffPositions=[['교장','COL_1'],['교감','COL_2'],['수석교사','COL_15'],['보직교사','COL_3'],['일반교사','COL_4'],['특수교사','COL_5'],['전문상담교사','COL_6'],['사서교사','COL_7'],['실기교사','COL_8'],['보건교사','COL_9'],['영양교사','COL_10'],['기간제교사','COL_11'],['강사','COL_13'],['원어민강사','COL_14']];
function parseStaff(r){return {total:num(r.COL_S),leave:num(r.COL_R_SUM),positions:staffPositions.map(([label,key])=>[label,num(r[key])]).filter(([,n])=>n)};}
// 학교알리미 중계 호출: 올해 → 작년 순으로 시도. 자료 없음(noData)만 세션 캐시, 오류는 캐시하지 않고 던진다.
async function alrimiRows(apiType,sido,sgg,kind,signal){
 if(snapshotIndex)return snapshotRows(apiType,sido,kind);
 const key=apiType+'|'+sido+'|'+sgg+'|'+kind;if(alrimiCache.has(key))return alrimiCache.get(key);
 const thisYear=now.getFullYear();let lastError=null,noData=false;
 for(const year of [thisYear,thisYear-1]){
  const q=new URLSearchParams({sido,kind,year:String(year)});if(sgg)q.set('sgg',sgg);
  let r,data;
  try{r=await fetch((alrimiBase()||'.')+'/api/alrimi/'+apiType+'?'+q,{signal});data=await r.json().catch(()=>({}));}
  catch(error){if(error.name==='AbortError')throw error;lastError=new Error('학교알리미 중계 서버에 연결할 수 없습니다.');continue;}
  if(!r.ok){lastError=new Error(data.error||'학교알리미 조회에 실패했습니다.');if(r.status===503)break;continue;}
  if(data.rows?.length){const result={rows:data.rows,year:String(year)};alrimiCache.set(key,result);return result;}
  noData=true;
 }
 if(lastError&&!noData)throw lastError;
 const empty={rows:[],year:'',noData:true};alrimiCache.set(key,empty);return empty;
}
async function loadAlrimi(selected,signal,force=false){
 if(state.demo||!selected.length)return;
 if(alrimiReady===null&&alrimiProbe)await alrimiProbe;
 if(!alrimiEnabled())return;
 if(alrimiReady===false&&!force)return;
 const regions=await regionsData(),office=state.loadedOffice,region=regions[sidoNameOf(office)];
 if(!region){alrimiError='이 교육청의 지역 코드표가 없어 학교알리미 자료를 조회할 수 없습니다.';return;}
 alrimiError='';
 // 전체 지역은 시도 단위 호출(학교급당 1~2회)을 먼저 시도하고, 자료가 없으면 시군구 단위로 내려간다.
 // 스냅숏은 시도·학교급 파일 하나에 모든 학교가 들어 있으므로 늘 시도 단위로 맞춘다.
 const wholeSido=!!snapshotIndex||(!state.loadedDistrict&&selected.length>40&&sidoWide!==false);
 const matched=await alrimiGroups(selected,wholeSido,regions,office,region,signal);
 if(wholeSido&&!snapshotIndex){if(matched>0)sidoWide=true;else if(!signal?.aborted){sidoWide=false;await alrimiGroups(selected,false,regions,office,region,signal);}}
}
async function alrimiGroups(selected,wholeSido,regions,office,region,signal){
 const groups=new Map();
 for(const s of selected){const kind=kindCodes[s.SCHUL_KND_SC_NM];if(!kind)continue;const district=wholeSido?'':districtOf(s),g=district+'|'+kind;if(!groups.has(g))groups.set(g,{district,kind,schools:[]});groups.get(g).schools.push(s);}
 const tasks=[...groups.values()];let cursor=0,matched=0;
 const run=async task=>{
  const {sido,codes}=task.district?sggCodesFor(regions,office,task.district):{sido:region.code,codes:['']};
  const byName=new Map();let tried=false,rowCount=0;
  for(const sgg of (codes.length?codes:[''])){try{const result=await alrimiRows('09',sido,sgg,task.kind,signal);tried=true;for(const r of result.rows){const n=normName(r.SCHUL_NM);if(!n)continue;rowCount++;const list=byName.get(n);if(list)list.push({r,year:result.year});else byName.set(n,[{r,year:result.year}]);}}catch(error){if(error.name==='AbortError')return;alrimiError=error.message;}}
  if(tried)alrimiTried.set(task.district+'|'+task.kind,rowCount);
  for(const s of task.schools){const hits=byName.get(normName(s.SCHUL_NM))||[],hit=hits.length>1?hits.find(h=>String(h.r.ADRCD_NM||'').split(/\s+/).includes(districtOf(s))):hits[0];if(hit){alrimiStats.set(s.SD_SCHUL_CODE,{...parseStudents(hit.r),year:hit.year,sido,kind:task.kind,district:districtOf(s)});matched++;}}
 };
 await Promise.all(Array.from({length:Math.min(4,tasks.length)},async()=>{while(cursor<tasks.length&&!signal?.aborted)await run(tasks[cursor++]);}));
 return matched;
}
const alrimiAttempted=s=>{const kind=kindCodes[s.SCHUL_KND_SC_NM];return alrimiTried.has(districtOf(s)+'|'+kind)||alrimiTried.has('|'+kind);};
async function loadStaffFor(school){const st=alrimiStats.get(school.SD_SCHUL_CODE);if(!st)return null;if(alrimiStaff.has(school.SD_SCHUL_CODE))return alrimiStaff.get(school.SD_SCHUL_CODE);const regions=await regionsData(),{sido,codes}=sggCodesFor(regions,state.loadedOffice,st.district);let found=null;for(const sgg of (codes.length?codes:[''])){const result=await alrimiRows('22',sido,sgg,st.kind);found=result.rows.find(r=>st.code&&String(r.SCHUL_CODE||'')===st.code)||result.rows.find(r=>normName(r.SCHUL_NM)===normName(school.SCHUL_NM));if(found)break;}const parsed=found?parseStaff(found):null;alrimiStaff.set(school.SD_SCHUL_CODE,parsed);return parsed;}

function alrimiStatus(){return alrimiProbe=probeAlrimi();}
async function probeAlrimi(){const el=$('#alrimi-status');if(await alrimiSnapshot()){alrimiReady=true;el.textContent=`학생·교사 수(학교알리미): ${snapshotIndex.years.join('·')} 공시 자료를 사용합니다(${snapshotIndex.fetched} 수집).`;return;}if(!alrimiEnabled()){el.textContent='학생·교사 수(학교알리미): 중계 서버 주소(API_BASE)가 설정되지 않아 표시하지 않습니다.';alrimiReady=false;return;}try{const r=await fetch((alrimiBase()||'.')+'/api/alrimi/status',{cache:'no-store'});const d=await r.json();alrimiReady=!!d.configured;el.textContent=d.configured?'학생·교사 수(학교알리미): 중계 서버와 인증키가 설정되어 있습니다.':'학생·교사 수(학교알리미): 중계 서버는 연결되었지만 인증키가 설정되지 않았습니다.';}catch{alrimiReady=false;el.textContent='학생·교사 수(학교알리미): 중계 서버에 연결할 수 없습니다.';}}
async function loadClassesFor(school,signal){const k=classKey(school);if(classCache.has(k))return classCache.get(k);const rows=await api('classInfo',{ATPT_OFCDC_SC_CODE:school.ATPT_OFCDC_SC_CODE,SD_SCHUL_CODE:school.SD_SCHUL_CODE,AY:ay()},signal);const c=summarizeClasses(rows);classCache.set(k,c);return c;}
const now=new Date();
const state={month:new Date(now.getFullYear(),now.getMonth(),1),type:'전체',query:'',view:'overview',districtSort:'schools',list:false,schools:[],events:[],demo:true,busy:false,revision:0,loadedOffice:'K10',loadedDistrict:'',allSchools:[],failures:0,eventsLoaded:false,loadingSchools:false,schoolLayout:'cards',schoolSort:'name',cardLimit:120,officeSort:'students'};
try{state.schoolLayout=localStorage.getItem('schoolLayout')==='table'?'table':'cards';state.schoolSort=localStorage.getItem('schoolSort')||'name';}catch{}
const ymd=d=>`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
const pretty=d=>/^\d{8}$/.test(d||'')?`${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}`:d||'—';
function demoSchools(){return ['솔빛초등학교','늘봄초등학교','바다초등학교','푸른초등학교','해솔중학교','가온중학교','온빛고등학교','새봄고등학교','다솜특수학교'].map((name,i)=>({SD_SCHUL_CODE:'demo'+i,SCHUL_NM:name,SCHUL_KND_SC_NM:types[i<4?1:i<6?2:i<8?3:4],ATPT_OFCDC_SC_CODE:'K10',ATPT_OFCDC_SC_NM:offices.K10,ORG_RDNMA:'강원특별자치도 '+gangwonDistricts[i%gangwonDistricts.length]+' 가상배움로 '+(i+1),JU_ORG_NM:'가상교육지원청',FOND_SC_NM:i===7?'사립':'공립',ORG_TELNO:'—',ORG_FAXNO:'—',COEDU_SC_NM:'남녀공학',FOND_YMD:'20000301',FOAS_MEMRD:'20000301',ENG_SCHUL_NM:'',HMPG_ADRES:'',LOAD_DTM:'데모 자료'}));}
function demoEvents(){const names=['2학기 교육과정 설명회','학교운영위원회','현장체험학습','학부모 공개수업','진로 탐색의 날','학교 스포츠 한마당','교직원 연수','독서 문화 주간']; const list=[];const last=new Date(state.month.getFullYear(),state.month.getMonth()+1,0).getDate();for(let day=1;day<=last;day++){const d=new Date(state.month.getFullYear(),state.month.getMonth(),day);if(d.getDay()===0||d.getDay()===6)continue;for(let j=0;j<(day%3===0?3:day%2===0?2:1);j++){const school=state.allSchools[(day+j*3)%state.allSchools.length];if(school)list.push({...school,AA_YMD:ymd(d),EVENT_NM:names[(day+j)%names.length],EVENT_CNTNT:'화면 확인용 가상 일정입니다. 실제 학교 행사와 관계없습니다.'});}}return list.filter(e=>!state.loadedDistrict||districtOf(e)===state.loadedDistrict);}
$('#office').innerHTML=Object.entries(offices).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
try{$('#office').value=localStorage.getItem('office')||'K10';}catch{}if(!$('#office').value)$('#office').value='K10';
let centeredDistrict=null;
function renderDistricts(){
 const office=$('#office').value;
 const regions=office===state.loadedOffice&&!state.demo?[...new Set(state.allSchools.map(districtOf))].sort((a,b)=>a.localeCompare(b,'ko')):office==='K10'?gangwonDistricts:[];
 const counts=new Map();if(!state.demo&&office===state.loadedOffice)for(const s of state.allSchools){const d=districtOf(s);counts.set(d,(counts.get(d)||0)+1);}
 const count=d=>counts.size?'<span class="chip-count">'+(d?counts.get(d)||0:state.allSchools.length)+'</span>':'';
 $('#districts').innerHTML=['',...regions].map(d=>'<button type="button" class="district-button '+(state.loadedDistrict===d?'active':'')+'" data-district="'+esc(d)+'" aria-pressed="'+(state.loadedDistrict===d)+'" '+(state.loadingSchools?'disabled':'')+'>'+esc(d||'전체')+count(d)+'</button>').join('');
 // 모바일에서는 지역 버튼이 한 줄로 가로 스크롤되므로, 선택이 바뀌면 선택한 버튼을 가운데로 가져온다.
 const box=$('#districts'),on=box.querySelector('.active');if(on&&centeredDistrict!==state.loadedDistrict&&box.scrollWidth>box.clientWidth){box.scrollLeft+=on.getBoundingClientRect().left-box.getBoundingClientRect().left-(box.clientWidth-on.offsetWidth)/2;centeredDistrict=state.loadedDistrict;}
 $('#district-hint').textContent=state.demo?'데모에서는 가상 학교가 있는 지역만 결과가 표시됩니다.':!regions.length?'학교를 불러오면 지역 버튼이 표시됩니다.':'';
}
async function selectDistrict(district){
 scheduleController?.abort();state.revision++;busy(false);
 state.loadedDistrict=district;state.cardLimit=boardPage;
 try{localStorage.setItem('district',district);}catch{}
 state.schools=state.allSchools.filter(s=>!district||districtOf(s)===district);
 renderDistricts();
 // 전체 지역은 학교가 수백 곳이라 첫 조회와 같이 공시 집계만 바로 하고, 일정·학급 편성은 '전체 지역 일정 조회'를 누를 때 불러온다.
 if(!district&&!state.demo){state.events=[];state.eventsLoaded=false;state.failures=0;notice('전체 지역 '+fmt(state.schools.length)+'개교 · 학사일정은 지역을 고르거나 전체 지역 일정 조회를 눌러 불러옵니다.');render();loadAlrimi(state.schools).then(render,()=>{});return;}
 await loadEvents();
}
function notice(text,error=false){$('#notice').textContent=text;$('#notice').classList.toggle('error',error);}
function schools(){return state.schools.filter(s=>(state.type==='전체'||s.SCHUL_KND_SC_NM===state.type)&&(!state.query||[s.SCHUL_NM,s.ORG_RDNMA,s.JU_ORG_NM].some(x=>x?.includes(state.query))));}
function events(){return state.events.filter(e=>(state.type==='전체'||e.SCHUL_KND_SC_NM===state.type)&&(!state.query||[e.SCHUL_NM,e.EVENT_NM,e.EVENT_CNTNT].some(x=>x?.includes(state.query)))).sort((a,b)=>a.AA_YMD.localeCompare(b.AA_YMD)||a.SCHUL_NM.localeCompare(b.SCHUL_NM,'ko'));}
function eventButton(e){const index=state.events.indexOf(e);return `<button class="event ${color(e.SCHUL_KND_SC_NM)}" data-event="${index}" title="${esc(e.SCHUL_NM+' · '+e.EVENT_NM)}">${esc(e.SCHUL_NM.replace(/학교$/,''))} · ${esc(e.EVENT_NM)}</button>`;}
const eventRules=[['입학·졸업·개학',/입학|졸업|수료|개학|종업|방학식/],['휴업·공휴일',/휴업|방학|개교기념|공휴|대체|휴일|추석|설날|한글날|개천절|현충일|광복절|성탄|크리스마스|어린이날|석가탄신|부처님/],['평가·고사',/고사|평가|시험|모의|수능/],['체험·행사',/체험|수학여행|소풍|축제|한마당|대회|발표회|운동회|캠프|견학|수련|현장/],['상담·연수·협의',/상담|연수|협의회|워크숍|회의|설명회|공개수업|학부모/]];
const eventType=name=>(eventRules.find(([,re])=>re.test(name||''))||['기타'])[0];
function stripChart(segments){const live=segments.filter(s=>s.value>0),total=live.reduce((a,s)=>a+s.value,0);if(!total)return '';let x=0;const parts=live.map((s,i)=>{const w=s.value/total*100,el=`<rect class="strip-seg ${esc(s.cls)}" x="${x.toFixed(2)}%" width="${Math.max(0,w-(i<live.length-1?0.7:0)).toFixed(2)}%" height="6" rx="2"><title>${esc(s.label)} ${fmt(s.value)} (${pct(s.value,total)}%)</title></rect>`;x+=w;return el;});return `<div class="strip"><svg width="100%" height="6" aria-hidden="true">${parts.join('')}</svg><ul class="strip-legend">${live.map(s=>`<li><span class="swatch ${esc(s.cls)}"></span>${esc(s.label)} <b>${fmt(s.value)}</b></li>`).join('')}</ul></div>`;}
function dayStrip(filtered){const y=state.month.getFullYear(),m=state.month.getMonth(),last=new Date(y,m+1,0).getDate(),counts=Array.from({length:last},()=>0);for(const e of filtered){const d=Number(String(e.AA_YMD).slice(6,8));if(d>=1&&d<=last)counts[d-1]++;}const max=Math.max(1,...counts),w=100/last;return `<div class="daystrip"><svg width="100%" height="40" role="img" aria-label="일별 일정 수">${counts.map((c,i)=>{const wd=new Date(y,m,i+1).getDay(),h=c?Math.max(8,c/max*100):0;return `<rect class="day-col${wd===0||wd===6?' weekend':''}${c&&c===max?' is-max':''}" x="${(i*w).toFixed(2)}%" width="${(w-0.4).toFixed(2)}%" y="${(100-h).toFixed(1)}%" height="${h.toFixed(1)}%" rx="1.5"><title>${m+1}월 ${i+1}일 · ${c}건</title></rect>`;}).join('')}</svg><div class="daystrip-axis"><span>1일</span><span>${Math.ceil(last/2)}일</span><span>${last}일</span></div></div>`;}
// --- 한눈에 보기: 선택한 교육청·관할 지역의 학교를 지표 띠, 학교급·규모·지역·일정 카드로 요약한다.
// 학생·교원 수(학교알리미 공시 스냅숏)는 지역을 고르지 않아도 바로 집계되고, 일정·학급 편성(NEIS)은 지역을 고르거나 전체 조회를 눌러야 채워진다.
const smallLimit=()=>officeSummary?.smallSchool||60;
const dec=v=>v==null?'—':v.toFixed(1);
const kindLegend=`<ul class="strip-legend">${types.slice(1).map(t=>`<li><span class="swatch ${color(t)}"></span>${t}</li>`).join('')}</ul>`;
// 학교 묶음 합계. 학급당·교사 1인당 학생은 두 값이 모두 공시된 학교끼리만 나눈다. 소규모 학교는 시도교육청 화면과 같은 기준(학생 60명 이하 초·중·고).
function agg(list){
 const r={schools:list.length,students:0,classes:0,teachers:0,nS:0,nC:0,nT:0,pcS:0,pcC:0,ptS:0,ptT:0,small:0,regular:0};
 for(const s of list){
  const st=alrimiStats.get(s.SD_SCHUL_CODE),c=classesOf(s);
  if(c!=null){r.classes+=c;r.nC++;}
  if(st?.students!=null){r.students+=st.students;r.nS++;if(st.classes){r.pcS+=st.students;r.pcC+=st.classes;}if(st.teachers){r.ptS+=st.students;r.ptT+=st.teachers;}if(s.SCHUL_KND_SC_NM!=='특수학교'){r.regular++;if(st.students<=smallLimit())r.small++;}}
  if(st?.teachers!=null){r.teachers+=st.teachers;r.nT++;}
 }
 return {...r,perClass:r.pcC?r.pcS/r.pcC:null,perTeacher:r.ptT?r.ptS/r.ptT:null};
}
const studentsOf=s=>alrimiStats.get(s.SD_SCHUL_CODE)?.students;
const monthLabel=()=>(state.month.getFullYear()===now.getFullYear()&&state.month.getMonth()===now.getMonth()?'이번 달':(state.month.getMonth()+1)+'월');
function kpiStrip(items,evList){
 const own=evList.filter(isSchoolEvent),a=agg(items),ready=state.eventsLoaded&&!state.busy||state.demo,years=[...new Set(items.map(s=>alrimiStats.get(s.SD_SCHUL_CODE)?.year).filter(Boolean))].sort();
 const cover=n=>n<items.length?` · ${fmt(n)}/${fmt(items.length)}개교`:'';
 const basis=n=>n?(years.join('·')||'학교알리미')+' 공시'+cover(n):state.demo?'데모에서는 제공하지 않음':alrimiError?'학교알리미 조회 실패':alrimiEnabled()?'학교알리미 공시':'중계 서버 미설정';
 const neisN=items.filter(s=>classTotal(s)!=null).length;
 const kinds=types.slice(1).map(t=>[t,items.filter(s=>s.SCHUL_KND_SC_NM===t).length]).filter(([,n])=>n).map(([t,n])=>`<span><i class="swatch ${color(t)}"></i>${t==='특수학교'?'특수':t[0]} ${fmt(n)}</span>`).join('');
 return [
  kpiCell('학교',items.length?fmt(items.length):'—','개교',kinds),
  kpiCell('학생',a.nS?fmt(a.students):'—','명',basis(a.nS)),
  kpiCell('학급',a.nC?fmt(a.classes):'—','학급',a.nC?(neisN===a.nC?ay()+'학년도 편성':neisN?'학년도 편성·공시':(years.join('·')||'학교알리미')+' 공시')+cover(a.nC):basis(0)),
  kpiCell('교사',a.nT?fmt(a.teachers):'—','명',basis(a.nT)),
  kpiCell('학급당 학생',dec(a.perClass),'명',a.perTeacher!=null?`교사 1인당 ${dec(a.perTeacher)}명`:basis(0)),
  kpiCell(monthLabel()+' 학교 일정',ready?fmt(own.length):'—','건',ready?`${fmt(new Set(own.map(e=>e.SD_SCHUL_CODE)).size)}개교 · 휴일 제외`:state.busy&&state.eventsLoaded?'불러오는 중…':'조회 전')
 ].join('');
}
function overviewCards(items,evList){
 if(!items.length)return `<article class="chart-card span-12">${chartEmpty(state.loadingSchools||state.busy?'학교 정보를 불러오는 중입니다.':'조회 조건에 맞는 학교가 없습니다.','school')}</article>`;
 const scope=state.loadedDistrict||'전체 지역',all=agg(items);
 // 학교급별 현황: 도넛(학교 수) 옆의 규모 표가 범례를 겸한다.
 const kindRows=types.slice(1).map(t=>{const list=items.filter(s=>s.SCHUL_KND_SC_NM===t);return {t,cls:color(t),n:list.length,a:agg(list)};});
 const cells=(n,a)=>`<td class="num">${fmt(n)}</td><td class="num">${a.nS?fmt(a.students):'—'}</td><td class="num">${a.nC?fmt(a.classes):'—'}</td><td class="num">${a.nT?fmt(a.teachers):'—'}</td><td class="num">${dec(a.perClass)}</td>`;
 const kindTable=`<div class="table-wrap"><table class="mini-table"><thead><tr><th>학교급</th><th class="num">학교</th><th class="num">학생</th><th class="num">학급</th><th class="num">교사</th><th class="num">학급당</th></tr></thead><tbody>${kindRows.map(r=>`<tr class="${r.n?'':'is-zero'}"><td><span class="swatch ${r.cls}"></span>${r.t}<small>${r.n?pct(r.n,items.length)+'%':''}</small></td>${cells(r.n,r.a)}</tr>`).join('')}</tbody><tfoot><tr><td>합계</td>${cells(items.length,all)}</tr></tfoot></table></div>`;
 const fond=[['공립','accent'],['국립','accent-2'],['사립','neutral']].map(([f,cls])=>({label:f,value:items.filter(s=>s.FOND_SC_NM===f).length,cls}));
 const composition=chartCard({title:'학교급별 현황',caption:scope+(all.nS?' · 학생·교사 학교알리미 공시':''),body:`<div class="kind-split">${donutChart({segments:kindRows.map(r=>({label:r.t,value:r.n,cls:r.cls})),center:fmt(items.length),sub:'개교',label:'학교급별 학교 수',legend:false})}${kindTable}</div>${stripChart(fond)}`,span:7});
 const known=items.filter(s=>classesOf(s)!=null),bands=[['6학급 이하',0,6],['7~12학급',7,12],['13~24학급',13,24],['25학급 이상',25,Infinity]];
 const sizeRows=bands.map(([label,lo,hi])=>({label,value:known.filter(s=>{const c=classesOf(s);return c>=lo&&c<=hi;}).length}));
 // 학생 수 구간은 소규모 학교 기준(특수학교 제외)과 맞춰 초·중·고만 센다.
 const lim=smallLimit(),regular=items.filter(s=>s.SCHUL_KND_SC_NM!=='특수학교'&&studentsOf(s)!=null),studentBands=[[lim+'명 이하',0,lim],[(lim+1)+'~200명',lim+1,200],['201~600명',201,600],['601명 이상',601,Infinity]];
 const studentRows=studentBands.map(([label,lo,hi])=>({label,value:regular.filter(s=>studentsOf(s)>=lo&&studentsOf(s)<=hi).length}));
 const block=(head,body)=>`<div class="sub-block"><p class="sub-head">${head}</p>${body}</div>`;
 const sizeBody=(known.length?block('학급 수 기준',barChart({rows:sizeRows,unit:'개교'})):chartEmpty(state.demo?'데모에서는 학급 정보를 제공하지 않습니다.':'지역을 선택하면 학급 수 기준 규모 분포가 표시됩니다.','layers'))+(regular.length?block('학생 수 기준 <small>초·중·고</small>',barChart({rows:studentRows,unit:'개교'})):'');
 const sizeNote=known.length?`${known.length<items.length?`학급 정보 <b>${fmt(known.length)}</b>/${fmt(items.length)}개교 · `:''}평균 <b>${(known.reduce((x,s)=>x+classesOf(s),0)/known.length).toFixed(1)}</b>학급${all.regular?` · 학생 ${lim}명 이하 초·중·고 <b>${pct(all.small,all.regular)}%</b>`:''}`:'';
 const size=chartCard({title:'학교 규모 분포',caption:'학교 수',body:sizeBody,note:sizeNote,span:5});
 const ranked=items.filter(s=>studentsOf(s)!=null).length,regional=state.loadedDistrict?(ranked>20?schoolBarsCard(items,8)+smallCard(items,4):schoolBarsCard(items,12)):districtCard(items)+topCard(items)+smallCard(items,6);
 return composition+size+scheduleCards(evList)+regional;
}
// 지역별 현황(전체 지역): 시·군·구마다 학교급 구성 막대(모든 지역 같은 눈금)와 규모 지표. 지역 이름을 누르면 그 지역으로 좁힌다.
const districtCols=[['name','지역'],['schools','학교'],['students','학생'],['perClass','학급당 학생'],['small','소규모 학교',()=>`학생 ${smallLimit()}명 이하`]];
function districtCard(items){
 const map=new Map();for(const s of items){const d=districtOf(s);if(!map.has(d))map.set(d,[]);map.get(d).push(s);}
 if(map.size<2)return '';
 const rows=[...map].map(([name,list])=>({name,list,a:agg(list),kinds:types.slice(1).map(t=>[t,list.filter(s=>s.SCHUL_KND_SC_NM===t).length])}));
 const key=state.districtSort,val={schools:r=>r.list.length,students:r=>r.a.nS?r.a.students:null,perClass:r=>r.a.perClass,small:r=>r.a.regular?r.a.small/r.a.regular:null}[key],byName=(a,b)=>a.name.localeCompare(b.name,'ko');
 rows.sort(val?(a,b)=>(val(b)??-1)-(val(a)??-1)||byName(a,b):byName);
 const max=Math.max(1,...rows.map(r=>r.list.length));
 const bar=r=>{let x=0;return `<svg class="sbar-track" width="100%" height="12" role="img" aria-label="${esc(r.name+' 학교 '+r.list.length+'개: '+r.kinds.map(([t,n])=>t+' '+n).join(', '))}">${r.kinds.map(([t,n])=>{if(!n)return '';const w=n/max*100,el=`<rect class="bar-fill ${color(t)}" x="${x.toFixed(3)}%" width="${w.toFixed(3)}%" height="12" rx="2"><title>${esc(r.name)} · ${t} ${n}개교</title></rect>`;x+=w;return el;}).join('')}</svg>`;};
 const small=a=>a.regular?`<span class="meter" title="초·중·고 ${a.regular}개교 중 ${a.small}개교 (${pct(a.small,a.regular)}%)"><svg width="44" height="6" aria-hidden="true"><rect class="meter-track" width="100%" height="6" rx="3"/>${a.small?`<rect class="meter-fill" width="${(a.small/a.regular*100).toFixed(1)}%" height="6" rx="3"/>`:''}</svg>${fmt(a.small)}<small>개교</small></span>`:'—';
 const head=districtCols.map(([k,label,sub])=>`<th class="${k==='name'?'':'num'}"${key===k?` aria-sort="${k==='name'?'ascending':'descending'}"`:''}><button type="button" class="sort-th${key===k?' is-sorted':''}" data-district-sort="${k}">${label}${key===k?(k==='name'?' ↑':' ↓'):''}${sub?`<small>${esc(sub())}</small>`:''}</button></th>`);
 head.splice(1,0,'<th class="bar-col">학교급 구성</th>');
 const all=agg(items);
 const table=`<div class="table-wrap"><table class="district-table"><thead><tr>${head.join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td><button type="button" class="text-button" data-district="${esc(r.name)}" title="${esc(r.name)}만 보기">${esc(r.name)}${icon('next')}</button></td><td class="bar-col">${bar(r)}</td><td class="num"><b>${fmt(r.list.length)}</b></td><td class="num">${r.a.nS?fmt(r.a.students):'—'}</td><td class="num">${dec(r.a.perClass)}</td><td class="num">${small(r.a)}</td></tr>`).join('')}</tbody><tfoot><tr><td>합계<small>${fmt(rows.length)}개 시·군·구</small></td><td class="bar-col"></td><td class="num"><b>${fmt(items.length)}</b></td><td class="num">${all.nS?fmt(all.students):'—'}</td><td class="num">${dec(all.perClass)}</td><td class="num">${small(all)}</td></tr></tfoot></table></div>`;
 return chartCard({title:'지역별 현황',caption:`${rows.length}개 시·군·구 · 머리글을 누르면 정렬`,body:kindLegend+table,note:'지역 이름을 누르면 그 지역으로 좁혀 학사일정과 학급 편성까지 불러옵니다. 지역은 학교 도로명 주소의 시·군·구 기준입니다.',span:12});
}
// 학교별 학생 수(지역 선택 시): 학교 수가 적으니 학교마다 막대 하나. 많으면 상위 20개교만 그리고 나머지는 합계로 적는다.
function schoolBarsCard(items,span){
 const ranked=items.filter(s=>studentsOf(s)!=null).sort((a,b)=>studentsOf(b)-studentsOf(a));
 if(!ranked.length)return '';
 const top=ranked.slice(0,20),rest=ranked.slice(20);
 const rows=top.map(s=>({label:s.SCHUL_NM,value:studentsOf(s),cls:color(s.SCHUL_KND_SC_NM),hint:s.SCHUL_KND_SC_NM}));
 return chartCard({title:'학교별 학생 수',caption:(state.loadedDistrict||'전체 지역')+' · 학교알리미 공시',body:kindLegend+barChart({rows,unit:'명',cols:rows.length>8?2:1}),note:rest.length?`학생 수 상위 ${top.length}개교입니다. 나머지 ${fmt(rest.length)}개교(학생 ${fmt(rest.reduce((x,s)=>x+studentsOf(s),0))}명)는 학교별 현황에서 확인하세요.`:'',span});
}
function topCard(items){
 const ranked=items.filter(s=>studentsOf(s)!=null).sort((a,b)=>studentsOf(b)-studentsOf(a));
 if(!ranked.length)return '';
 const rows=ranked.slice(0,8).map(s=>({label:s.SCHUL_NM,value:studentsOf(s),cls:color(s.SCHUL_KND_SC_NM),hint:s.SCHUL_KND_SC_NM+' · '+districtOf(s)}));
 return chartCard({title:'학생 수 상위 학교',caption:'학교알리미 공시',body:kindLegend+barChart({rows,unit:'명'}),span:6});
}
// 소규모 학교: 학생 수가 적은 순서. 특수학교는 시도교육청 화면과 같이 뺀다.
function smallCard(items,span){
 if(!items.some(s=>studentsOf(s)!=null))return '';
 const lim=smallLimit(),list=items.filter(s=>s.SCHUL_KND_SC_NM!=='특수학교'&&studentsOf(s)!=null&&studentsOf(s)<=lim).sort((a,b)=>studentsOf(a)-studentsOf(b)||a.SCHUL_NM.localeCompare(b.SCHUL_NM,'ko'));
 const shown=list.slice(0,8),where=s=>state.loadedDistrict?townOf(s):districtOf(s);
 const body=list.length?`<ul class="rank-list">${shown.map(s=>`<li><button type="button" class="text-button" data-school="${esc(s.SD_SCHUL_CODE)}"><span class="swatch ${color(s.SCHUL_KND_SC_NM)}"></span><span>${esc(s.SCHUL_NM)}</span></button><span class="rank-meta">${esc(where(s))}</span><b>${fmt(studentsOf(s))}<small>명</small></b></li>`).join('')}</ul>`:chartEmpty(`학생 ${lim}명 이하인 초·중·고가 없습니다.`,'school');
 return chartCard({title:'소규모 학교',caption:`학생 ${lim}명 이하 · ${fmt(list.length)}개교`,body,note:list.length>shown.length?`학생 수가 적은 ${shown.length}개교입니다. 나머지 ${fmt(list.length-shown.length)}개교는 학교별 현황 표에서 확인하세요.`:'',span});
}
// 일정 카드: 유형·일별 분포와 다가오는 학교 일정(토요휴업일·공휴일 제외). 전체 지역은 학교가 많아 조회 버튼을 누를 때만 불러온다.
function scheduleCards(evList){
 const label=monthLabel();
 if(!state.demo&&(!state.eventsLoaded||state.busy)){
  const loading=state.eventsLoaded&&state.busy;
  return `<article class="chart-card span-12 banner">${icon('calendar-check')}<div><strong>${loading?label+' 학사일정을 불러오는 중입니다':label+' 학사일정은 아직 조회하지 않았습니다'}</strong><p>${loading?'학교 수가 많으면 시간이 걸립니다. 위 진행 막대에서 진행 상황을 볼 수 있습니다.':`관할 지역을 고르면 바로 조회되고, 전체 ${fmt(state.schools.length)}개교를 한 번에 조회할 수도 있습니다(시간이 걸릴 수 있습니다).`}</p></div>${loading?'':'<button type="button" class="button primary compact" data-load-all>전체 지역 일정 조회</button>'}</article>`;
 }
 const own=evList.filter(isSchoolEvent),counts=new Map();for(const e of own){const t=eventType(e.EVENT_NM);counts.set(t,(counts.get(t)||0)+1);}
 const typeRows=[...eventRules.map(r=>r[0]),'기타'].map(t=>({label:t,value:counts.get(t)||0,muted:t==='기타'})).filter(r=>r.value).sort((a,b)=>(a.label==='기타')-(b.label==='기타')||b.value-a.value);
 const types_=chartCard({title:label+' 학교 일정 유형',caption:`${fmt(own.length)}건 · ${fmt(new Set(own.map(e=>e.SD_SCHUL_CODE)).size)}개교`,body:typeRows.length?barChart({rows:typeRows,unit:'건'})+`<p class="sub-head">날짜별 건수</p>`+dayStrip(own):chartEmpty('조회된 학교 일정이 없습니다.'),note:`토요휴업일·국가 공휴일처럼 모든 학교에 같은 일정은 뺐습니다(달력에는 표시). 전체 일정 ${fmt(evList.length)}건.`,span:5});
 const current=label==='이번 달',today=ymd(now),upcoming=current?own.filter(e=>e.AA_YMD>=today):own,shown=upcoming.slice(0,9);
 const groups=[];for(const e of shown){const last=groups[groups.length-1];if(last&&last[0]===e.AA_YMD)last[1].push(e);else groups.push([e.AA_YMD,[e]]);}
 const body=shown.length?`<ol class="agenda">${groups.map(([d,list])=>`<li><time${d===today?' class="is-today"':''}>${shortDate(d)}${d===today?'<em>오늘</em>':''}</time><ul>${list.map(e=>`<li><button type="button" class="agenda-item" data-event="${state.events.indexOf(e)}" title="${esc(e.SCHUL_NM+' · '+e.EVENT_NM)}"><span class="swatch ${color(e.SCHUL_KND_SC_NM)}"></span><b>${esc(e.SCHUL_NM)}</b><span>${esc(e.EVENT_NM)}</span></button></li>`).join('')}</ul></li>`).join('')}</ol>`:chartEmpty(current?'이번 달 남은 학교 일정이 없습니다.':'등록된 학교 일정이 없습니다.');
 const agenda=chartCard({title:current?'다가오는 학교 일정':label+' 학교 일정',caption:`${fmt(upcoming.length)}건 · 토요휴업일·공휴일 제외`,body,note:`${upcoming.length>shown.length?`외 ${fmt(upcoming.length-shown.length)}건 · `:''}<button type="button" class="link-button" data-view="calendar">학사일정에서 모두 보기</button>`,span:7});
 return types_+agenda;
}
// 카드는 한 번에 boardPage개까지 그리고(전체 지역 수백 개교 대비), 남는 학교가 적으면 한꺼번에 보여 준다.
const boardPage=120;
// --- 학교별 현황 보드: 학교마다 규모(학급·학생·교원), 학년별 학급, 이번 달 학교 일정을 카드 한 장에 모은다.
// 토요휴업일·국가 공휴일은 모든 학교에 똑같이 들어 있어 학교 일정에서 뺀다(달력·목록에는 그대로 표시).
const commonDay=/^(토요휴업일|개천절|한글날|대체공휴일|추석(연휴)?|설날(연휴)?|성탄절|크리스마스|기독탄신일|현충일|광복절|어린이날|부처님오신날|석가탄신일|삼일절|3·1절|신정|.*선거일)$/;
const isSchoolEvent=e=>!commonDay.test(String(e.EVENT_NM||'').replace(/\s+/g,''));
const shortDate=d=>/^\d{8}$/.test(d||'')?`${+d.slice(4,6)}.${+d.slice(6,8)} (${'일월화수목금토'[new Date(+d.slice(0,4),+d.slice(4,6)-1,+d.slice(6,8)).getDay()]})`:d||'';
function townOf(s){const district=districtOf(s),town=(s.ORG_RDNMA||'').trim().split(/\s+/).slice(1,4).find(p=>/[읍면동]$/.test(p)&&p!==district);return district+(town?' '+town:'');}
function schoolEventIndex(){const map=new Map();state.events.forEach((e,i)=>{if(!isSchoolEvent(e))return;const list=map.get(e.SD_SCHUL_CODE);if(list)list.push(i);else map.set(e.SD_SCHUL_CODE,[i]);});for(const list of map.values())list.sort((a,b)=>state.events[a].AA_YMD.localeCompare(state.events[b].AA_YMD));return map;}
const alrimiShown=items=>items.some(s=>alrimiStats.has(s.SD_SCHUL_CODE))||(!state.demo&&alrimiEnabled()&&alrimiReady!==false);
function sortSchools(items,evCount){const val={classes:classesOf,students:s=>alrimiStats.get(s.SD_SCHUL_CODE)?.students,events:evCount}[state.schoolSort],name=(a,b)=>a.SCHUL_NM.localeCompare(b.SCHUL_NM,'ko');return [...items].sort(val?(a,b)=>(val(b)??-1)-(val(a)??-1)||name(a,b):name);}
// 학년별 막대: 학교알리미 공시가 있으면 학년별 학생 수, 없으면 NEIS 학급 편성의 학년별 학급 수를 쓴다.
// 막대는 학교마다 따로 눈금을 잡아 학년별 분포 모양을 보여 준다. 학교 간 규모 비교는 지표 숫자와 정렬이 맡는다
// (공유 눈금은 학년당 1~250명 범위에서 작은 학교 막대가 모두 납작해져 읽을 수 없었다).
const classesOf=s=>classTotal(s)??alrimiStats.get(s.SD_SCHUL_CODE)?.classes;
function gradeData(s){
 const st=alrimiStats.get(s.SD_SCHUL_CODE),grades=st?.grades.filter(g=>g.isGrade&&g.students!=null)||[];
 if(grades.length)return {unit:'students',head:'학년별 학생 수',note:(st.year?st.year+' ':'')+'공시',bars:grades.map(g=>({label:g.short,value:g.students,title:g.label+' '+fmt(g.students)+'명'+(g.classes!=null?' · '+g.classes+'학급':'')}))};
 const c=classCache.get(classKey(s));
 if(c?.total)return {unit:'classes',head:'학년별 학급',note:ay()+'학년도 편성',bars:c.bars.map(b=>({label:b.label,value:b.count,title:b.label+' '+b.count+'학급'}))};
 return null;
}
function gradeBars(data){
 const max=Math.max(1,...data.bars.map(b=>b.value));
 return `<div class="gbars" role="img" aria-label="${esc(data.head+' '+data.bars.map(b=>b.label+' '+b.value).join(', '))}">${data.bars.map(b=>{const h=b.value?Math.max(4,b.value/max*100):0;return `<div class="gbar" title="${esc(b.title)}"><svg width="100%" height="36" aria-hidden="true"><rect class="gbar-fill" x="16%" width="68%" y="${(100-h).toFixed(1)}%" height="${h.toFixed(1)}%" rx="2.5"/></svg><b>${fmt(b.value)}</b><small>${esc(b.label)}</small></div>`;}).join('')}</div>`;
}
function schoolCard(s,evIdx,withAlrimi){
 const code=s.SD_SCHUL_CODE,st=alrimiStats.get(code),cls=color(s.SCHUL_KND_SC_NM),loading=state.busy&&state.eventsLoaded,ready=(state.eventsLoaded&&!loading)||state.demo;
 const list=evIdx.get(code)||[],m=state.month.getMonth()+1,current=state.month.getFullYear()===now.getFullYear()&&state.month.getMonth()===now.getMonth();
 const upcoming=current?list.filter(i=>state.events[i].AA_YMD>=ymd(now)):[],shown=(upcoming.length?upcoming:list).slice(0,3);
 const metric=(label,value,unit,text=fmt(value))=>`<div><dt>${label}</dt><dd${value==null?' class="is-na"':''}>${value==null?'—':text+`<small>${unit}</small>`}</dd></div>`;
 const founded=/^\d{4}/.test(s.FOND_YMD||'')?Number(s.FOND_YMD.slice(0,4)):null,events=ready?list.length:null;
 const metrics=withAlrimi?[metric('학급',classesOf(s),'학급'),metric('학생',st?.students,'명'),metric('교사',st?.teachers,'명'),metric('학교 일정',events,'건')]:[metric('학급',classTotal(s),'학급'),metric('학교 일정',events,'건'),metric('설립',founded,'년',String(founded))];
 const grade=gradeData(s);
 const tags=[s.FOND_SC_NM,{'남':'남학교','여':'여학교'}[s.COEDU_SC_NM]].filter(Boolean).join(' · ');
 const eventsBody=!ready?'<p class="sc-na">불러오는 중…</p>':!list.length?`<p class="sc-na">${m}월에 등록된 학교 일정이 없습니다.</p>`:`<ul class="sc-events">${shown.map(i=>{const e=state.events[i];return `<li><button class="sc-event" data-event="${i}" title="${esc(e.EVENT_NM)}"><time>${shortDate(e.AA_YMD)}</time><span>${esc(e.EVENT_NM)}</span></button></li>`;}).join('')}</ul>${list.length>shown.length?`<button class="sc-more" data-school="${esc(code)}">${m}월 일정 ${list.length-shown.length}건 더 보기</button>`:''}`;
 return `<article class="school-card k-${cls}"><div class="sc-head"><div class="sc-title"><p class="sc-kicker"><span class="badge ${cls}">${esc(s.SCHUL_KND_SC_NM)}</span>${tags?`<span>${esc(tags)}</span>`:''}</p><h3 class="sc-name"><button class="text-button" data-school="${esc(code)}">${esc(s.SCHUL_NM)}</button></h3><p class="sc-sub">${esc(townOf(s))}${s.ORG_TELNO?' · '+esc(s.ORG_TELNO):''}</p></div><button class="icon-button" data-school="${esc(code)}" aria-label="${esc(s.SCHUL_NM)} 상세정보">${icon('next')}</button></div><dl class="sc-metrics m${metrics.length}">${metrics.join('')}</dl>${grade?`<div class="sc-sec"><p class="sc-sec-head">${grade.head}<small>${esc(grade.note)}</small></p>${gradeBars(grade)}</div>`:state.eventsLoaded&&!state.demo?`<div class="sc-sec"><p class="sc-sec-head">학년별 학급</p><p class="sc-na">${state.busy?'불러오는 중…':classCache.has(classKey(s))?'공개된 학급 정보가 없습니다.':'학급 정보를 불러오지 못했습니다.'}</p></div>`:''}${state.eventsLoaded||state.demo?`<div class="sc-sec"><p class="sc-sec-head">${upcoming.length?'다가오는 일정':m+'월 일정'}</p>${eventsBody}</div>`:''}</article>`;
}
function schoolTable(sorted,withAlrimi,evCount,ready){return `<div class="table-wrap"><table><thead><tr><th>학교명</th><th>학교급</th><th class="num">학급수</th>${withAlrimi?'<th class="num">학생수</th><th class="num">교사수</th>':''}<th class="num">학교 일정</th><th>설립</th><th>주소 · 관할</th><th>전화번호</th></tr></thead><tbody>${sorted.map(s=>`<tr><td><button class="text-button" data-school="${esc(s.SD_SCHUL_CODE)}">${esc(s.SCHUL_NM)}${icon('external')}</button></td><td><span class="badge ${color(s.SCHUL_KND_SC_NM)}">${esc(s.SCHUL_KND_SC_NM)}</span></td><td class="num">${fmt(classesOf(s))}</td>${withAlrimi?`<td class="num">${fmt(alrimiStats.get(s.SD_SCHUL_CODE)?.students)}</td><td class="num">${fmt(alrimiStats.get(s.SD_SCHUL_CODE)?.teachers)}</td>`:''}<td class="num">${ready?fmt(evCount(s)):'—'}</td><td>${esc(s.FOND_SC_NM)}</td><td>${esc(s.ORG_RDNMA)}<small>${esc(s.JU_ORG_NM)}</small></td><td class="nowrap">${esc(s.ORG_TELNO||'—')}</td></tr>`).join('')}</tbody></table></div>`;}
function schoolBoard(items){
 const withAlrimi=alrimiShown(items),evIdx=schoolEventIndex(),evCount=s=>(evIdx.get(s.SD_SCHUL_CODE)||[]).length,ready=(state.eventsLoaded&&!state.busy)||state.demo;
 const sorted=sortSchools(items,evCount);
 const prompt=!state.demo&&!state.eventsLoaded?`<div class="board-prompt">${icon('calendar-check')}<div><strong>지역을 선택하면 학교별 학급·일정 현황이 채워집니다.</strong><p>위의 관할 지역 버튼을 누르거나, 전체 ${fmt(items.length)}개교를 한 번에 조회하세요. 학교 수가 많으면 시간이 걸릴 수 있습니다.</p></div><button type="button" class="button compact primary" data-load-all>전체 지역 현황 조회</button></div>`:'';
 if(state.schoolLayout==='table')return (prompt?`<div class="board-note">${prompt}</div>`:'')+schoolTable(sorted,withAlrimi,evCount,ready);
 const limit=items.length<=state.cardLimit+30?items.length:state.cardLimit;let budget=limit;
 const groups=types.slice(1).map(t=>[t,sorted.filter(s=>s.SCHUL_KND_SC_NM===t)]).filter(([,list])=>list.length).map(([t,list])=>{
  if(budget<=0)return '';const visible=list.slice(0,budget);budget-=visible.length;
  const classes=list.map(classesOf).filter(n=>n!=null),students=list.map(s=>alrimiStats.get(s.SD_SCHUL_CODE)?.students).filter(n=>n!=null),total=a=>fmt(a.reduce((x,n)=>x+n,0));
  const summary=[classes.length?`학급 <b>${total(classes)}</b>`:'',students.length?`학생 <b>${total(students)}</b>명`:''].filter(Boolean).join(' · ');
  return `<section class="school-group" aria-label="${t}"><div class="group-head"><span class="swatch ${color(t)}"></span><h3>${t}</h3><span class="chip-count">${fmt(list.length)}</span>${summary?`<small>${summary}</small>`:''}</div><div class="school-grid">${visible.map(s=>schoolCard(s,evIdx,withAlrimi)).join('')}</div></section>`;
 }).join('');
 const more=items.length-limit;
 return `<div class="board">${prompt}${groups}${more>0?`<div class="board-more"><button type="button" class="button" data-more-schools>${fmt(more)}개교 더 보기</button></div>`:''}</div>`;
}
// --- 시도교육청 현황: 공시 스냅숏 요약(alrimi/summary.json, scripts/alrimi-summary.mjs)으로 17개 시도교육청을 한 화면에서 비교한다.
const officeShort={B10:'서울',C10:'부산',D10:'대구',E10:'인천',F10:'광주',G10:'대전',H10:'울산',I10:'세종',J10:'경기',K10:'강원',M10:'충북',N10:'충남',P10:'전북',Q10:'전남',R10:'경북',S10:'경남',T10:'제주'};
let officeSummary=null,summaryPromise=null,summaryError='';
function loadSummary(){return summaryPromise??=Promise.all([fetch('alrimi/summary.json').then(r=>{if(!r.ok)throw new Error('summary');return r.json();}),regionsData()]).then(([summary,regions])=>{officeSummary=officeRows(summary,regions);render();}).catch(()=>{summaryPromise=null;summaryError='시도교육청 현황 자료(학교알리미 공시 요약)를 불러오지 못했습니다. 새로고침해 보세요.';render();});}
function officeRows(summary,regions){
 const derive=r=>({...r,perClass:r.classes?r.students/r.classes:null,perTeacher:r.teachers?r.students/r.teachers:null,smallRate:r.regular?r.small/r.regular:null,entry:r.g6?r.g1/r.g6:null});
 const rows=Object.keys(offices).map(code=>{const k=summary.sidos[regions[sidoNameOf(code)]?.code]||{},parts=Object.entries(k),total=f=>parts.reduce((a,[,x])=>a+(x[f]||0),0),regular=parts.filter(([kind])=>kind!=='05');
  return {code,name:officeShort[code],full:offices[code],kinds:Object.fromEntries(types.slice(1).map(t=>[t,k[kindCodes[t]]?.students||0])),schools:total('schools'),students:total('students'),classes:total('classes'),teachers:total('teachers'),regular:regular.reduce((a,[,x])=>a+x.schools,0),small:regular.reduce((a,[,x])=>a+(x.small||0),0),g1:k['02']?.grades?.[0]||0,g6:k['02']?.grades?.[5]||0};}).filter(r=>r.schools);
 const nation=['schools','students','classes','teachers','regular','small','g1','g6'].reduce((o,f)=>(o[f]=rows.reduce((a,r)=>a+r[f],0),o),{code:'',name:'전국',full:'전국 합계'});
 return {rows:rows.map(derive),nation:derive(nation),years:summary.years||[],fetched:summary.fetched||'',smallSchool:summary.smallSchool||60};
}
// 파생 지표는 머리글 아래에 기준을 적고(sub), 마우스를 올리면 정의(hint)를 보여 준다.
const officeCols=[['name','시도교육청'],['schools','학교'],['students','학생'],['perClass','학급당 학생','명'],['perTeacher','교사 1인당 학생','명'],['smallRate','소규모 학교',n=>`학생 ${n}명 이하`,n=>`학생 수가 ${n}명 이하인 초·중·고 비율(특수학교 제외). 교육부 적정규모학교 권고기준(지역별 60~300명)과 다른 단순 기준입니다.`],['entry','초1 ÷ 초6','입학생 추세',()=>'초등 1학년 학생 수 ÷ 6학년 학생 수. 100%보다 낮을수록 입학생이 줄고 있다는 뜻입니다.']];
const ratio=v=>v==null?'—':(v*100).toFixed(1)+'%';
const meter=v=>v==null?'—':`<span class="meter"><svg width="56" height="6" aria-hidden="true"><rect class="meter-track" width="100%" height="6" rx="3"/>${v>0?`<rect class="meter-fill" width="${Math.min(100,v*100).toFixed(1)}%" height="6" rx="3"/>`:''}</svg>${ratio(v)}</span>`;
function officesView(){
 if(!officeSummary)return summaryError?`<div class="empty">${icon('layers')}<strong>자료를 불러오지 못했습니다</strong><p>${esc(summaryError)}</p></div>`:`<div class="empty">${icon('layers')}<p>시도교육청 현황을 불러오는 중…</p></div>`;
 const {rows,nation,years,fetched,smallSchool}=officeSummary,basis=(years.join('·')||'학교알리미')+' 공시';
 const tiles=[['학교',fmt(nation.schools),'개교',rows.length+'개 시도교육청'],['학생',fmt(nation.students),'명',basis],['학급',fmt(nation.classes),'학급',basis],['교사',fmt(nation.teachers),'명',basis],['학급당 학생',dec(nation.perClass),'명',`교사 1인당 ${dec(nation.perTeacher)}명`],['소규모 학교',ratio(nation.smallRate),'',`학생 ${smallSchool}명 이하 초·중·고`]].map(([label,n,unit,note])=>kpiCell(label,n,unit,esc(note))).join('');
 // 학생 수 순위 막대(학교급별 누적). 막대 길이는 모든 시도가 같은 눈금이다.
 const byStudents=[...rows].sort((a,b)=>b.students-a.students),max=Math.max(1,...rows.map(r=>r.students));
 const bars=byStudents.map(r=>{let x=0;const segs=types.slice(1).map(t=>{const v=r.kinds[t];if(!v)return '';const w=v/max*100,el=`<rect class="bar-fill ${color(t)}" x="${x.toFixed(3)}%" width="${w.toFixed(3)}%" height="14" rx="2"><title>${esc(r.name)} · ${t} ${fmt(v)}명 (${pct(v,r.students)}%)</title></rect>`;x+=w;return el;}).join('');
  return `<div class="sbar-row${r.code===state.loadedOffice&&!state.demo?' is-current':''}"><button class="text-button sbar-label" data-office="${r.code}" title="${esc(r.full)} 학교별 현황 보기">${esc(r.name)}</button><svg class="sbar-track" width="100%" height="14" role="img" aria-label="${esc(r.full+' 학생 '+fmt(r.students)+'명: '+types.slice(1).map(t=>t+' '+fmt(r.kinds[t])).join(', '))}">${segs}</svg><b class="bar-value">${fmt(r.students)}<small>명</small></b></div>`;}).join('');
 const legend=`<ul class="strip-legend">${types.slice(1).map(t=>`<li><span class="swatch ${color(t)}"></span>${t} <b>${fmt(rows.reduce((a,r)=>a+r.kinds[t],0))}</b></li>`).join('')}</ul>`;
 const chart=chartCard({title:'시도교육청별 학생 수',caption:basis+' · 학교급별',body:legend+`<div class="sbars">${bars}</div>`,note:'시도 이름을 누르면 그 교육청의 학교별 현황으로 이동합니다.',wide:true});
 const key=state.officeSort,sorted=[...rows].sort((a,b)=>key==='name'?Object.keys(offices).indexOf(a.code)-Object.keys(offices).indexOf(b.code):(b[key]??-1)-(a[key]??-1));
 const cells=r=>`<td class="num">${fmt(r.schools)}</td><td class="num">${fmt(r.students)}</td><td class="num">${r.perClass==null?'—':r.perClass.toFixed(1)}</td><td class="num">${r.perTeacher==null?'—':r.perTeacher.toFixed(1)}</td><td class="num">${meter(r.smallRate)}</td><td class="num">${meter(r.entry)}</td>`;
 const table=`<div class="table-wrap"><table class="office-table"><thead><tr>${officeCols.map(([k,label,sub,hint])=>{const text=f=>typeof f==='function'?f(smallSchool):f||'';return `<th class="${k==='name'?'':'num'}"${key===k?` aria-sort="${k==='name'?'ascending':'descending'}"`:''}><button type="button" class="sort-th${key===k?' is-sorted':''}" data-office-sort="${k}"${hint?` title="${esc(text(hint))}"`:''}>${label}${key===k?(k==='name'?' ↑':' ↓'):''}${sub?`<small>${esc(text(sub))}</small>`:''}</button></th>`;}).join('')}<th><span class="sr-only">이동</span></th></tr></thead><tbody>${sorted.map(r=>`<tr class="${r.code===state.loadedOffice&&!state.demo?'is-current':''}"><td><b>${esc(r.name)}</b><small>${esc(r.full)}</small></td>${cells(r)}<td><button type="button" class="button compact" data-office="${r.code}">학교 보기</button></td></tr>`).join('')}</tbody><tfoot><tr><td><b>전국</b><small>${fmt(rows.length)}개 시도교육청</small></td>${cells(nation)}<td></td></tr></tfoot></table></div>`;
 const compare=chartCard({title:'시도교육청 비교',caption:'머리글을 누르면 정렬',body:table,note:`학교 수는 학생이 있는 공시 학교(분교·방송통신중 포함), 학급당·교사 1인당 학생은 시도 합계로 나눈 값입니다. 소규모 학교는 학생 수가 ${smallSchool}명 이하인 초·중·고 비율(특수학교 제외)로, 교육부 적정규모학교 권고기준(면·도서·벽지 60명, 읍 지역 초 120·중고 180명, 도시 지역 초 240·중고 300명 이하)과 다른 단순 기준입니다. 초1 ÷ 초6은 초등 1학년 학생 수를 6학년 학생 수로 나눈 값으로 100%보다 낮을수록 입학생이 줄고 있다는 뜻입니다. 출처: 학교알리미 ${esc(basis)}(${esc(fetched)} 수집).`,wide:true});
 return `<section class="kpis card" aria-label="전국 지표">${tiles}</section><div class="overview">${chart}${compare}</div>`;
}
const viewText={overview:['한눈에 보기','관내 학교의 규모와 구성, 이번 달 일정을 한 화면에서 확인하세요.'],schools:['학교별 현황','학교마다 학급·학생·교원 규모와 이번 달 일정을 이어서 확인하세요.'],calendar:['학사일정','관내 학교의 학사일정을 달력과 목록으로 확인하세요.'],offices:['시도교육청 비교','전국 시도교육청의 학교·학생·교원 규모를 학교알리미 공시로 한눈에 비교하세요.']};
function setHeading(){
 const [title,subtitle]=viewText[state.view];$('#heading').textContent=title;$('#subtitle').textContent=subtitle;document.title=title+' · 학교모아';
 document.querySelectorAll('.nav[data-view]').forEach(b=>{const on=b.dataset.view===state.view;b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
}
function renderOffices(){
 if(!officeSummary&&!summaryError)loadSummary();
 $('#scope-summary').textContent='전국 · 17개 시도교육청';
 $('#offices-view').innerHTML=officesView();
 setHeading();
}
const byDate=list=>[...list].sort((a,b)=>a.AA_YMD.localeCompare(b.AA_YMD)||a.SCHUL_NM.localeCompare(b.SCHUL_NM,'ko'));
function render(){
 const officeView=state.view==='offices',overview=state.view==='overview';
 for(const sel of ['.scope','.status-row'])$(sel).hidden=officeView;
 $('#progress').hidden=officeView||!state.busy;
 $('#stats').hidden=!overview;$('#overview').hidden=!overview;$('#surface').hidden=officeView||overview;
 $('#offices-view').hidden=!officeView;
 if(officeView){renderOffices();return;}
 renderDistricts();
 setHeading();
 $('#scope-summary').textContent=(state.demo?'데모 · ': '')+offices[state.loadedOffice].replace('교육청','')+' / '+(state.loadedDistrict||'전체 지역');
 $('#load-schedules').hidden=overview||state.eventsLoaded||state.busy||state.demo;
 $('#load-schedules').textContent=state.view==='schools'?'전체 지역 현황 조회':'전체 지역 일정 조회';
 $('#source').textContent=state.demo?'데모 · 가상 학교 및 일정':'NEIS · '+offices[state.loadedOffice];$('#source').classList.toggle('live',!state.demo);
 // 한눈에 보기는 학교급·검색 필터와 관계없이 선택한 지역 전체를 요약한다(필터는 아래 두 화면에만 보인다).
 if(overview){const evAll=byDate(state.events);$('#stats').innerHTML=kpiStrip(state.schools,evAll);$('#overview').innerHTML=overviewCards(state.schools,evAll);return;}
 const filtered=events(),items=schools();
 $('#types').innerHTML=types.map(t=>`<button class="chip ${state.type===t?'active':''}" data-type="${t}" aria-pressed="${state.type===t}">${t==='전체'?'':`<span class="swatch ${color(t)}"></span>`}${t}<span class="chip-count">${state.schools.filter(s=>t==='전체'||s.SCHUL_KND_SC_NM===t).length}</span></button>`).join('');
 $('#month-title').textContent=`${state.month.getFullYear()}년 ${state.month.getMonth()+1}월`;
 $('#event-count').textContent=`${state.failures?'일부 학교 미조회 · ':''}조회된 일정 ${filtered.length}건`;
 const first=new Date(state.month); first.setDate(1-first.getDay());
 const cells=Math.ceil((state.month.getDay()+new Date(state.month.getFullYear(),state.month.getMonth()+1,0).getDate())/7)*7;
 const awaiting=!state.eventsLoaded&&!state.demo;
 $('#calendar').innerHTML=(awaiting?'<div class="calendar-prompt"><div>'+icon('calendar')+'<strong>어느 지역의 일정을 살펴볼까요?</strong><p>위에서 관할 지역을 선택하면 이번 달 일정이 표시됩니다.</p><button type="button" class="button primary" data-load-all>전체 지역 일정 조회</button></div></div>':'')+'<div class="weekdays">'+['일','월','화','수','목','금','토'].map(d=>`<span>${d}</span>`).join('')+'</div><div class="calendar-grid">'+Array.from({length:cells},(_,i)=>{const d=new Date(first);d.setDate(first.getDate()+i);const ds=ymd(d);const current=d.getMonth()===state.month.getMonth();const entries=current?filtered.filter(e=>e.AA_YMD===ds):[];return `<div class="day ${current?'':'outside'}"${entries.length?` data-date="${ds}"`:''}><span class="date ${ds===ymd(now)?'today':''}">${d.getDate()}</span>${entries.length?`<span class="day-count" aria-label="일정 ${entries.length}건">${entries.length}</span>`:''}${entries.slice(0,3).map(eventButton).join('')}${entries.length>3?`<button class="more" data-day="${ds}">+${entries.length-3}건 더 보기</button>`:''}</div>`;}).join('')+'</div>';
 $('#event-list').innerHTML=state.eventsLoaded||state.demo?eventTable(filtered):'<div class="empty">'+icon('calendar')+'<strong>어느 지역의 일정을 살펴볼까요?</strong><p>위에서 관할 지역을 선택하거나 전체 지역 일정을 조회하세요.</p></div>';
 $('#calendar').classList.toggle('awaiting',!state.eventsLoaded&&!state.demo);
 $('#calendar').hidden=state.list;$('#event-list').hidden=!state.list;
 $('#grid-btn').classList.toggle('selected',!state.list);$('#list-btn').classList.toggle('selected',state.list);
 if(state.view==='schools'){
  const withAlrimi=alrimiShown(items),sortSelect=$('#school-sort');
  sortSelect.querySelector('[value="students"]').disabled=!withAlrimi;
  sortSelect.value=state.schoolSort==='students'&&!withAlrimi?'name':state.schoolSort;
  document.querySelectorAll('[data-layout]').forEach(b=>{const on=b.dataset.layout===state.schoolLayout;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
  $('#board-summary').innerHTML=`<b>${fmt(items.length)}</b>개교 · ${esc(state.loadedDistrict||'전체 지역')}${state.type==='전체'?'':' · '+esc(state.type)}<small>학교 일정은 토요휴업일·공휴일을 뺀 ${state.month.getMonth()+1}월 일정입니다.</small>`;
  $('#school-list').innerHTML=items.length?schoolBoard(items):'<div class="empty">'+icon('school')+'조회 조건에 맞는 학교가 없습니다.</div>';
 }
 $('#calendar-view').hidden=state.view!=='calendar';$('#schools-view').hidden=state.view!=='schools';
}
function eventTable(items){return items.length?`<div class="table-wrap"><table><thead><tr><th>일자</th><th>학교</th><th>일정</th></tr></thead><tbody>${items.map(e=>`<tr><td>${pretty(e.AA_YMD)}</td><td><button class="text-button" data-school="${esc(e.SD_SCHUL_CODE)}">${esc(e.SCHUL_NM)}</button><small>${esc(e.SCHUL_KND_SC_NM)}</small></td><td><button class="text-button" data-event="${state.events.indexOf(e)}">${esc(e.EVENT_NM)}</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">'+icon('calendar')+'조회된 일정이 없습니다.<br>다른 달이나 학교급을 선택해 보세요.</div>';}
function showDetail(html){$('#detail-body').innerHTML=html;if(!$('#detail').open)$('#detail').showModal();}
const fields={ATPT_OFCDC_SC_NM:'시도교육청',SD_SCHUL_CODE:'학교 코드',ENG_SCHUL_NM:'영문 학교명',JU_ORG_NM:'관할 교육지원청',FOND_SC_NM:'설립 구분',LCTN_SC_NM:'시도명',ORG_RDNZC:'우편번호',ORG_RDNMA:'도로명 주소',ORG_RDNDA:'상세 주소',ORG_TELNO:'전화번호',ORG_FAXNO:'팩스번호',COEDU_SC_NM:'남녀공학 구분',HS_SC_NM:'고등학교 구분',HS_GNRL_BUSNS_SC_NM:'일반·전문 구분',SPCLY_PURPS_HS_ORD_NM:'특수목적고 계열',INDST_SPECL_CCCCL_EXST_YN:'산업체 특별학급',ENE_BFE_SEHF_SC_NM:'입시 전후기 구분',DGHT_SC_NM:'주야 구분',FOND_YMD:'설립일',FOAS_MEMRD:'개교기념일',LOAD_DTM:'자료 수정일'};
function staffMarkup(staff){if(staff&&staff.error)return `<p class="error-text">직위별 교원 현황을 불러오지 못했습니다. ${esc(staff.error)}</p>`;return staff===null?'<p>직위별 교원 현황 공시 자료가 없습니다.</p>':`<p class="facts"><span>교원 총 <b>${fmt(staff.total)}</b><small>명</small></span>${staff.positions.map(([l,n])=>`<span>${esc(l)} <b>${fmt(n)}</b><small>명</small></span>`).join('')}${staff.leave?`<span class="muted">휴직 ${fmt(staff.leave)}명 포함</span>`:''}</p>`;}
function alrimiSection(s){if(state.demo)return '';if(!alrimiEnabled())return '<section class="dialog-section"><h2>학생·교원 현황</h2><p>학교알리미 중계 서버가 설정되지 않아 학생 수와 교원 수를 표시할 수 없습니다.</p></section>';const st=alrimiStats.get(s.SD_SCHUL_CODE);if(!st){const tried=alrimiAttempted(s);return `<section class="dialog-section"><h2>학생·교원 현황</h2><p>${alrimiError&&!tried?esc(alrimiError):tried?'학교알리미에 같은 이름의 공시 자료가 없습니다. 분교나 명칭이 다른 학교일 수 있습니다.':'학교알리미 공시 자료를 아직 불러오지 않았습니다.'}</p>${tried&&!alrimiError?'':`<button class="button compact" data-load-alrimi="${esc(s.SD_SCHUL_CODE)}">${tried?'다시 시도':'학생·교원 현황 불러오기'}</button>`}</section>`;}const staff=alrimiStaff.get(s.SD_SCHUL_CODE);return `<section class="dialog-section"><h2>학생·교원 현황 <small>${esc(st.year)} 공시 · 학교알리미</small></h2><div class="facts"><span>학생 <b>${fmt(st.students)}</b><small>명</small></span><span>학급 <b>${fmt(st.classes)}</b><small>학급</small></span><span>학급당 <b>${fmt(st.perClass)}</b><small>명</small></span><span>교사 <b>${fmt(st.teachers)}</b><small>명</small></span><span>교사 1인당 <b>${fmt(st.perTeacher)}</b><small>명</small></span></div>${st.grades.length?`<div class="table-wrap"><table><thead><tr><th>구분</th><th class="num">학급 수</th><th class="num">학생 수</th><th class="num">학급당</th></tr></thead><tbody>${(()=>st.grades.map(g=>`<tr><td>${esc(g.label)}</td><td class="num">${fmt(g.classes)}</td><td class="num">${fmt(g.students)}</td><td class="num">${fmt(g.perClass)}</td></tr>`).join(''))()}</tbody></table></div>`:''}<div id="staff-slot" data-code="${esc(s.SD_SCHUL_CODE)}">${staff===undefined?'<p>직위별 교원 현황을 불러오는 중…</p>':staffMarkup(staff)}</div></section>`;}
function classSection(s){if(state.demo)return '';const c=classCache.get(classKey(s));if(!c)return `<section class="dialog-section"><h2>학급 현황</h2><p>${ay()}학년도 학급 정보를 아직 불러오지 않았습니다. 지역 일정을 조회하면 함께 불러옵니다.</p><button class="button compact" data-load-classes="${esc(s.SD_SCHUL_CODE)}">학급 정보 불러오기</button></section>`;const grades=[...c.byGrade.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ko',{numeric:true}));return `<section class="dialog-section"><h2>학급 현황 <small>${ay()}학년도 · 총 ${fmt(c.total)}학급</small></h2>${c.total?`<div class="table-wrap"><table><thead><tr><th>학년</th><th class="num">학급 수</th><th>학급</th><th>계열 · 학과</th></tr></thead><tbody>${grades.map(([g,info])=>`<tr><td>${esc(g)}학년</td><td class="num">${info.count}</td><td>${esc(info.names.join(', '))}</td><td>${esc([...info.tracks].join(', ')||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<p>공개된 학급 정보가 없습니다.</p>'}</section>`;}
function safeUrl(value){try{const u=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}}
function schoolDetail(code){const s=state.schools.find(s=>s.SD_SCHUL_CODE===code);if(!s)return;if(!state.demo&&alrimiStats.has(code)&&!alrimiStaff.has(code))loadStaffFor(s).catch(error=>({error:error.message})).then(staff=>{const slot=$('#staff-slot');if(slot&&$('#detail').open&&slot.dataset.code===code)slot.innerHTML=staffMarkup(staff??null);});const homepage=s.HMPG_ADRES?safeUrl(s.HMPG_ADRES):'';showDetail(`<p class="eyebrow">SCHOOL PROFILE ${state.demo?'· DEMO':''}</p><h2>${esc(s.SCHUL_NM)}</h2><span class="badge ${color(s.SCHUL_KND_SC_NM)}">${esc(s.SCHUL_KND_SC_NM)}</span> ${homepage?`<a class="button compact" target="_blank" rel="noreferrer" href="${esc(homepage)}">학교 홈페이지${icon('external')}</a>`:''}<dl class="details">${Object.entries(fields).map(([key,label])=>`<div class="field"><dt>${label}</dt><dd>${esc(key.endsWith('YMD')||key==='FOAS_MEMRD'?pretty(s[key]):s[key]||'—')}</dd></div>`).join('')}</dl>${alrimiSection(s)}${classSection(s)}<section class="dialog-section"><h2>이번 달 학사일정</h2>${eventTable(state.events.filter(e=>e.SD_SCHUL_CODE===code))}</section>${s.SCHUL_KND_SC_NM==='특수학교'?`<section class="dialog-section"><h2>특수학교 시간표</h2><p>학사행사와 별도로 과정·학년·학급·교시별 수업을 조회합니다.</p><label>조회 날짜 <input id="timetable-date" type="date" value="${state.month.getFullYear()}-${String(state.month.getMonth()+1).padStart(2,'0')}-01"></label> <button class="button" id="timetable-load" data-code="${esc(code)}">시간표 조회</button><div id="timetable-result" role="status"></div></section>`:''}`);}
async function api(endpoint,params,signal){
 if(mode==='direct'){
  const key=activeKey();if(!key)throw new Error('NEIS 인증키를 입력해 주세요.');
  const fetcher=(url,init={})=>fetch(url,{...init,signal:signal&&typeof AbortSignal.any==='function'?AbortSignal.any([signal,init.signal].filter(Boolean)):init.signal});
  return fetchRows(endpoint,params,key,fetcher);
 }
 const r=await fetch('api/'+endpoint+'?'+new URLSearchParams(params),{signal});const data=await r.json();if(!r.ok)throw new Error(data.error||'조회에 실패했습니다.');return data.rows;
}
function busy(value){state.busy=value;['#load','#office','#export'].forEach(s=>$(s).disabled=value);$('#load').textContent=value?'불러오는 중…':'새로고침';$('#progress').hidden=!value;$('#load-schedules').hidden=value||state.eventsLoaded||state.demo||state.view==='overview';$('#surface').setAttribute('aria-busy',String(value));renderDistricts();}
async function loadEvents(){
 if(state.loadingSchools)return;
 scheduleController?.abort();const controller=new AbortController();scheduleController=controller;
 const revision=++state.revision;state.eventsLoaded=true;
 if(state.demo){state.events=demoEvents();state.failures=0;render();return;}
 const selected=[...state.schools];state.events=[];state.failures=0;busy(true);render();
 const start=ymd(state.month),end=ymd(new Date(state.month.getFullYear(),state.month.getMonth()+1,0));const results=[];let cursor=0,done=0,failures=0;
 notice('학교 일정과 학급·학생·교원 정보를 불러오고 있습니다. 지역을 선택하면 조회 범위를 바꿀 수 있습니다.');
 const alrimiTask=loadAlrimi(selected,controller.signal).then(()=>{if(revision===state.revision&&state.busy)render();}).catch(()=>{});
 await Promise.all(Array.from({length:Math.min(5,selected.length)},async()=>{while(cursor<selected.length&&!controller.signal.aborted){const school=selected[cursor++];const cacheKey=school.ATPT_OFCDC_SC_CODE+school.SD_SCHUL_CODE+start;try{let rows=eventCache.get(cacheKey);if(!rows){rows=await api('SchoolSchedule',{ATPT_OFCDC_SC_CODE:school.ATPT_OFCDC_SC_CODE,SD_SCHUL_CODE:school.SD_SCHUL_CODE,AA_FROM_YMD:start,AA_TO_YMD:end},controller.signal);eventCache.set(cacheKey,rows);}results.push(...rows.map(e=>({...e,SCHUL_KND_SC_NM:school.SCHUL_KND_SC_NM})));}catch(error){if(error.name==='AbortError')return;failures++;}try{await loadClassesFor(school,controller.signal);}catch(error){if(error.name==='AbortError')return;}done++;if(revision===state.revision){$('#progress').value=done/selected.length;notice('일정·학급 정보 취합 중 · '+done+' / '+selected.length+'개교');}}}));
 if(revision!==state.revision)return;
 state.events=results;state.failures=failures;busy(false);render();
 alrimiTask.then(()=>{if(revision!==state.revision)return;render();if(alrimiError&&!selected.some(s=>alrimiStats.has(s.SD_SCHUL_CODE)))notice($('#notice').textContent+' · 학생·교원 공시 조회 실패: '+alrimiError,true);});
 notice(failures?failures+'개교 조회 실패 · 일부 결과만 표시합니다. 새로고침으로 다시 시도하세요.':(state.loadedDistrict||'전체 지역')+' · '+selected.length+'개교 / '+results.length+'건 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})+' 조회',!!failures);
}
async function loadSchools(){
 if(state.busy)return;state.loadingSchools=true;eventCache.clear();busy(true);notice('학교 정보를 불러오고 있습니다.');
 try{
 const office=$('#office').value;const rows=await api('schoolInfo',{ATPT_OFCDC_SC_CODE:office});
 const district=office===state.loadedOffice?state.loadedDistrict:'';
 state.allSchools=rows.filter(s=>types.slice(1).includes(s.SCHUL_KND_SC_NM));
 state.schools=state.allSchools.filter(s=>!district||districtOf(s)===district);
 state.demo=false;state.loadedOffice=office;state.loadedDistrict=district;
 try{localStorage.setItem('office',office);localStorage.setItem('district',district);}catch{}
 state.loadingSchools=false;state.events=[];state.eventsLoaded=false;busy(false);render();
 if(district)await loadEvents();else{notice('학교 정보가 준비되었습니다. 관할 지역 버튼으로 일정을 바로 확인하세요.');loadAlrimi(state.schools).then(render,()=>{});}
 }catch(error){state.loadingSchools=false;$('#office').value=state.loadedOffice;busy(false);notice(error.message+' 현재 표시된 데이터는 유지됩니다.',true);if(mode==='direct')$('#config-status').textContent=error.message;if(state.demo)$('#config').showModal();}
}
function startDemo(){state.revision++;state.demo=true;state.loadedOffice='K10';state.loadedDistrict='';$('#office').value='K10';state.allSchools=demoSchools();state.schools=state.allSchools;state.events=demoEvents();state.failures=0;busy(false);notice('데모 모드 · 아래 학교명과 일정은 모두 가상 자료입니다. 실제 학교 정보는 인증키 연결 후 조회하세요.');render();}
function csvCell(v){let value=String(v??'');if(/^[\s]*[=+@-]/.test(value))value="'"+value;return '"'+value.replace(/"/g,'""')+'"';}
function download(){if(state.view==='offices'){if(!officeSummary){notice('내려받을 자료가 없습니다.');return;}const cols=['시도교육청','학교','학생','학급','교사','학급당 학생','교사 1인당 학생',`소규모 학교 비율(학생 ${officeSummary.smallSchool}명 이하, %)`,'초1÷초6(%)'],line=r=>[r.full,r.schools,r.students,r.classes,r.teachers,r.perClass?.toFixed(1),r.perTeacher?.toFixed(1),r.smallRate==null?'':(r.smallRate*100).toFixed(1),r.entry==null?'':(r.entry*100).toFixed(1)];const text='\uFEFF'+[cols,...officeSummary.rows.map(line),line(officeSummary.nation)].map(row=>row.map(csvCell).join(',')).join('\r\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8;'}));link.download=`시도교육청현황_${officeSummary.years.join('-')}공시.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);return;}const calendarView=state.view==='calendar',list=!calendarView?(state.view==='schools'?schools():state.schools).map(s=>({...s,CLASS_COUNT:classesOf(s)??'',STUDENTS:alrimiStats.get(s.SD_SCHUL_CODE)?.students??'',TEACHERS:alrimiStats.get(s.SD_SCHUL_CODE)?.teachers??''})):events();if(!list.length){notice('내려받을 자료가 없습니다.');return;}const cols=!calendarView?{SCHUL_NM:'학교명',SCHUL_KND_SC_NM:'학교급',CLASS_COUNT:'학급수',STUDENTS:'학생수',TEACHERS:'교사수',FOND_SC_NM:'설립',JU_ORG_NM:'관할',ORG_RDNMA:'주소',ORG_TELNO:'전화',ORG_FAXNO:'팩스',HMPG_ADRES:'홈페이지',SD_SCHUL_CODE:'학교코드'}:{AA_YMD:'날짜',SCHUL_NM:'학교명',SCHUL_KND_SC_NM:'학교급',EVENT_NM:'일정명',EVENT_CNTNT:'내용'};const text='\uFEFF'+[Object.values(cols),...list.map(x=>Object.keys(cols).map(k=>x[k]))].map(row=>row.map(csvCell).join(',')).join('\r\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8;'}));link.download=`${state.demo?'데모_':state.failures?'일부결과_':''}${calendarView?'학사일정':'학교정보'}_${ymd(state.month).slice(0,6)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
$('#load').onclick=loadSchools;
$('#load-schedules').onclick=loadEvents;
$('#office').onchange=loadSchools;
$('#settings').onclick=()=>$('#config').showModal();
$('#demo').onclick=()=>{if(state.busy)return;$('#config').close();startDemo();};
$('#search').oninput=e=>{state.query=e.target.value.trim();state.cardLimit=boardPage;render();};
$('#school-sort').onchange=e=>{state.schoolSort=e.target.value;try{localStorage.setItem('schoolSort',state.schoolSort);}catch{}render();};
$('#export').onclick=download;
for(const [id,delta] of [['prev',-1],['next',1],['today',0]])$('#'+id).onclick=()=>{state.month=delta?new Date(state.month.getFullYear(),state.month.getMonth()+delta,1):new Date(now.getFullYear(),now.getMonth(),1);if(!state.eventsLoaded&&!state.loadedDistrict&&!state.demo)render();else loadEvents();};
$('#grid-btn').onclick=()=>{state.list=false;render();};$('#list-btn').onclick=()=>{state.list=true;render();};
function dayDetail(ds){showDetail(`<p class="eyebrow">DAILY SCHEDULE</p><h2>${pretty(ds)} 일정</h2>${eventTable(events().filter(x=>x.AA_YMD===ds))}`);}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b){const day=e.target.closest('.day[data-date]');if(day)dayDetail(day.dataset.date);return;}
 if(b.hasAttribute('data-district')){if(b.closest('#overview'))window.scrollTo({top:0,behavior:'smooth'});await selectDistrict(b.dataset.district);}
 if(b.hasAttribute('data-load-all'))await loadEvents();
 if(b.dataset.loadAlrimi){const s=state.schools.find(x=>x.SD_SCHUL_CODE===b.dataset.loadAlrimi);if(!s)return;b.disabled=true;b.textContent='불러오는 중…';await loadAlrimi([s],undefined,true).catch(()=>{});schoolDetail(s.SD_SCHUL_CODE);render();}
 if(b.dataset.loadClasses){const s=state.schools.find(x=>x.SD_SCHUL_CODE===b.dataset.loadClasses);if(!s)return;b.disabled=true;b.textContent='불러오는 중…';try{await loadClassesFor(s);schoolDetail(s.SD_SCHUL_CODE);render();}catch(error){b.disabled=false;b.textContent='다시 시도';notice(error.message,true);}}
 if(b.hasAttribute('data-close'))b.closest('dialog').close();
 if(b.dataset.type){state.type=b.dataset.type;state.cardLimit=boardPage;render();}
 if(b.dataset.view){state.view=b.dataset.view;state.cardLimit=boardPage;window.scrollTo(0,0);render();}
 if(b.dataset.districtSort){state.districtSort=b.dataset.districtSort;render();}
 if(b.dataset.layout){state.schoolLayout=b.dataset.layout;try{localStorage.setItem('schoolLayout',state.schoolLayout);}catch{}render();}
 if(b.hasAttribute('data-more-schools')){state.cardLimit+=boardPage;render();}
 if(b.dataset.officeSort){state.officeSort=b.dataset.officeSort;render();}
 if(b.dataset.office&&!state.busy){const same=b.dataset.office===state.loadedOffice&&!state.demo;$('#office').value=b.dataset.office;state.view='schools';state.cardLimit=boardPage;window.scrollTo(0,0);render();if(!same)await loadSchools();}
 if(b.dataset.school)schoolDetail(b.dataset.school);
 if(b.dataset.day)dayDetail(b.dataset.day);
 if(b.dataset.event!==undefined){const item=state.events[Number(b.dataset.event)];if(item)showDetail(`<p class="eyebrow">SCHOOL SCHEDULE ${state.demo?'· DEMO':''}</p><h2>${esc(item.EVENT_NM)}</h2><p>${pretty(item.AA_YMD)} · ${esc(item.SCHUL_NM)}</p><p>${esc(item.EVENT_CNTNT||'추가 설명이 없습니다.')}</p><button class="button" data-school="${esc(item.SD_SCHUL_CODE)}">학교 상세정보 보기${icon('next')}</button>`);}
 if(b.id==='timetable-load'){
  const target=$('#timetable-result'),date=$('#timetable-date').value.replaceAll('-','');if(!date){target.textContent='조회 날짜를 선택하세요.';return;}
  if(state.demo){target.innerHTML='<p>데모에서는 시간표를 제공하지 않습니다. NEIS 인증키 연결 후 실제 특수학교를 선택하세요.</p>';return;}
  const s=state.schools.find(s=>s.SD_SCHUL_CODE===b.dataset.code);b.disabled=true;target.textContent='시간표 조회 중…';
  try{const rows=await api('spsTimetable',{ATPT_OFCDC_SC_CODE:s.ATPT_OFCDC_SC_CODE,SD_SCHUL_CODE:s.SD_SCHUL_CODE,TI_FROM_YMD:date,TI_TO_YMD:date});target.innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>과정</th><th>학년·반</th><th>교시</th><th>수업내용</th><th>강의실</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.SCHUL_CRSE_SC_NM)}</td><td>${esc(r.GRADE)}학년 ${esc(r.CLASS_NM)}반</td><td>${esc(r.PERIO)}</td><td>${esc(r.ITRT_CNTNT)}</td><td>${esc(r.CLRM_NM||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<p>해당 날짜에 공개된 시간표가 없습니다.</p>';}catch(error){target.textContent=error.message;}finally{b.disabled=false;}
 }
});
$('#today-label').textContent=now.toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short'});
state.demo=false;render();notice('NEIS 연결을 확인하고 있습니다.');
function restoreScope(){try{state.loadedOffice=$('#office').value;state.loadedDistrict=localStorage.getItem('district')||'';}catch{}}
function keyStatus(){$('#config-status').textContent=direct.key?'이 브라우저에 저장된 개인 인증키로 NEIS에서 직접 조회합니다.':direct.shared?'공용 인증키로 NEIS에서 직접 조회합니다. 개인 인증키를 입력하면 그 키를 우선 사용합니다.':'인증키를 입력하면 실제 학교 정보와 학사일정을 조회합니다. 인증키가 없으면 데모를 둘러볼 수 있습니다.';}
async function serverStatus(){try{const r=await fetch('api/status',{cache:'no-store'});if(!r.ok||!(r.headers.get('content-type')||'').includes('json'))return null;return await r.json();}catch{return null;}}
$('#key-form').onsubmit=e=>{e.preventDefault();const key=$('#api-key').value.trim();if(!key)return;direct.key=key;try{localStorage.setItem('neisKey',key);}catch{}keyStatus();$('#config').close();restoreScope();loadSchools();};
$('#key-clear').onclick=()=>{direct.key='';$('#api-key').value='';try{localStorage.removeItem('neisKey');}catch{}keyStatus();if(!state.busy){if(activeKey())loadSchools();else startDemo();}};
serverStatus().then(data=>{
 if(data){alrimiStatus();$('#config-status').textContent=data.configured?'인증키가 설정되어 있습니다. 교육청과 지역을 선택해 조회하세요.':'현재 인증키가 설정되어 있지 않습니다.';if(data.configured){restoreScope();loadSchools();}else startDemo();return;}
 mode='direct';alrimiStatus();$('#key-form').hidden=false;$('#settings').querySelector('span').textContent='인증키 설정';$('#api-key').value=direct.key;keyStatus();
 if(activeKey()){restoreScope();loadSchools();}else{startDemo();$('#config').showModal();}
});
