import { fetchRows } from './neis.mjs';
import { config } from './config.js';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
const now=new Date();
const state={month:new Date(now.getFullYear(),now.getMonth(),1),type:'전체',query:'',view:'calendar',list:false,schools:[],events:[],demo:true,busy:false,revision:0,loadedOffice:'K10',loadedDistrict:'',allSchools:[],failures:0,eventsLoaded:false,loadingSchools:false};
const ymd=d=>`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
const pretty=d=>/^\d{8}$/.test(d||'')?`${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}`:d||'—';
function demoSchools(){return ['솔빛초등학교','늘봄초등학교','바다초등학교','푸른초등학교','해솔중학교','가온중학교','온빛고등학교','새봄고등학교','다솜특수학교'].map((name,i)=>({SD_SCHUL_CODE:'demo'+i,SCHUL_NM:name,SCHUL_KND_SC_NM:types[i<4?1:i<6?2:i<8?3:4],ATPT_OFCDC_SC_CODE:'K10',ATPT_OFCDC_SC_NM:offices.K10,ORG_RDNMA:'강원특별자치도 '+gangwonDistricts[i%gangwonDistricts.length]+' 가상배움로 '+(i+1),JU_ORG_NM:'가상교육지원청',FOND_SC_NM:i===7?'사립':'공립',ORG_TELNO:'—',ORG_FAXNO:'—',COEDU_SC_NM:'남녀공학',FOND_YMD:'20000301',FOAS_MEMRD:'20000301',ENG_SCHUL_NM:'',HMPG_ADRES:'',LOAD_DTM:'데모 자료'}));}
function demoEvents(){const names=['2학기 교육과정 설명회','학교운영위원회','현장체험학습','학부모 공개수업','진로 탐색의 날','학교 스포츠 한마당','교직원 연수','독서 문화 주간']; const list=[];const last=new Date(state.month.getFullYear(),state.month.getMonth()+1,0).getDate();for(let day=1;day<=last;day++){const d=new Date(state.month.getFullYear(),state.month.getMonth(),day);if(d.getDay()===0||d.getDay()===6)continue;for(let j=0;j<(day%3===0?3:day%2===0?2:1);j++){const school=state.allSchools[(day+j*3)%state.allSchools.length];if(school)list.push({...school,AA_YMD:ymd(d),EVENT_NM:names[(day+j)%names.length],EVENT_CNTNT:'화면 확인용 가상 일정입니다. 실제 학교 행사와 관계없습니다.'});}}return list.filter(e=>!state.loadedDistrict||districtOf(e)===state.loadedDistrict);}
$('#office').innerHTML=Object.entries(offices).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
try{$('#office').value=localStorage.getItem('office')||'K10';}catch{}if(!$('#office').value)$('#office').value='K10';
function renderDistricts(){
 const office=$('#office').value;
 const regions=office===state.loadedOffice&&!state.demo?[...new Set(state.allSchools.map(districtOf))].sort((a,b)=>a.localeCompare(b,'ko')):office==='K10'?gangwonDistricts:[];
 $('#districts').innerHTML=['',...regions].map(d=>'<button type="button" class="district-button '+(state.loadedDistrict===d?'active':'')+'" data-district="'+esc(d)+'" aria-pressed="'+(state.loadedDistrict===d)+'" '+(state.loadingSchools?'disabled':'')+'>'+esc(d||'전체')+'</button>').join('');
 $('#district-hint').textContent=state.demo?'데모에서는 가상 학교가 있는 지역만 결과가 표시됩니다.':!regions.length?'학교를 불러오면 지역 버튼이 표시됩니다.':'';
}
async function selectDistrict(district){
 scheduleController?.abort();state.revision++;busy(false);
 state.loadedDistrict=district;
 try{localStorage.setItem('district',district);}catch{}
 state.schools=state.allSchools.filter(s=>!district||districtOf(s)===district);
 renderDistricts();
 await loadEvents();
}
function notice(text,error=false){$('#notice').textContent=text;$('#notice').classList.toggle('error',error);}
function schools(){return state.schools.filter(s=>(state.type==='전체'||s.SCHUL_KND_SC_NM===state.type)&&(!state.query||[s.SCHUL_NM,s.ORG_RDNMA,s.JU_ORG_NM].some(x=>x?.includes(state.query))));}
function events(){return state.events.filter(e=>(state.type==='전체'||e.SCHUL_KND_SC_NM===state.type)&&(!state.query||[e.SCHUL_NM,e.EVENT_NM,e.EVENT_CNTNT].some(x=>x?.includes(state.query)))).sort((a,b)=>a.AA_YMD.localeCompare(b.AA_YMD)||a.SCHUL_NM.localeCompare(b.SCHUL_NM,'ko'));}
function eventButton(e){const index=state.events.indexOf(e);return `<button class="event ${color(e.SCHUL_KND_SC_NM)}" data-event="${index}" title="${esc(e.SCHUL_NM+' · '+e.EVENT_NM)}">${esc(e.SCHUL_NM.replace(/학교$/,''))} · ${esc(e.EVENT_NM)}</button>`;}
function render(){
 renderDistricts();
 const filtered=events();
 $('#scope-summary').textContent=(state.demo?'데모 · ': '')+offices[state.loadedOffice].replace('교육청','')+' / '+(state.loadedDistrict||'전체 지역');
 $('#load-schedules').hidden=state.eventsLoaded||state.busy||state.demo;
 $('#load-schedules').textContent='전체 지역 일정 조회';
 $('#stats').innerHTML=[['조회 학교',schools().length,'개교','▥'],['이번 달 일정',state.eventsLoaded||state.demo?filtered.length:'—','건','▦'],['일정 등록 학교',new Set(filtered.map(e=>e.SD_SCHUL_CODE)).size,'개교','▧'],['선택한 학교급',state.type==='전체'?'전체':state.type.replace('학교',''),'','◉']].map(([label,n,unit,icon])=>`<div class="stat"><div><span class="stat-label">${label}</span><strong>${n}<small>${unit}</small></strong></div><span class="stat-icon">${icon}</span></div>`).join('');
 $('#types').innerHTML=types.map(t=>`<button class="chip ${state.type===t?'active':''}" data-type="${t}" aria-pressed="${state.type===t}">${t}<span class="chip-count">${state.schools.filter(s=>t==='전체'||s.SCHUL_KND_SC_NM===t).length}</span></button>`).join('');
 $('#month-title').textContent=`${state.month.getFullYear()}년 ${state.month.getMonth()+1}월`;
 $('#event-count').textContent=`${state.failures?'일부 학교 미조회 · ':''}조회된 일정 ${filtered.length}건`;
 $('#source').textContent=state.demo?'데모 · 가상 학교 및 일정':'NEIS · '+offices[state.loadedOffice];$('#source').classList.toggle('live',!state.demo);
 const first=new Date(state.month); first.setDate(1-first.getDay());
 const cells=Math.ceil((state.month.getDay()+new Date(state.month.getFullYear(),state.month.getMonth()+1,0).getDate())/7)*7;
 $('#calendar').innerHTML='<div class="weekdays">'+['일','월','화','수','목','금','토'].map(d=>`<span>${d}</span>`).join('')+'</div><div class="calendar-grid">'+Array.from({length:cells},(_,i)=>{const d=new Date(first);d.setDate(first.getDate()+i);const ds=ymd(d);const current=d.getMonth()===state.month.getMonth();const entries=current?filtered.filter(e=>e.AA_YMD===ds):[];return `<div class="day ${current?'':'outside'}"><span class="date ${ds===ymd(now)?'today':''}">${d.getDate()}</span>${entries.slice(0,3).map(eventButton).join('')}${entries.length>3?`<button class="more" data-day="${ds}">+${entries.length-3}건 더 보기</button>`:''}</div>`;}).join('')+'</div>';
 $('#event-list').innerHTML=state.eventsLoaded||state.demo?eventTable(filtered):'<div class="empty"><strong>어느 지역의 일정을 살펴볼까요?</strong><p>위에서 관할 지역을 선택하거나 전체 지역 일정을 조회하세요.</p></div>';
 $('#calendar').classList.toggle('awaiting',!state.eventsLoaded&&!state.demo);
 $('#calendar').hidden=state.list;$('#event-list').hidden=!state.list;
 $('#grid-btn').classList.toggle('selected',!state.list);$('#list-btn').classList.toggle('selected',state.list);
 const items=schools();
 $('#school-list').innerHTML=items.length?`<div class="table-wrap"><table><thead><tr><th>학교명</th><th>학교급</th><th>설립</th><th>주소 · 관할</th><th>전화번호</th></tr></thead><tbody>${items.map(s=>`<tr><td><button class="text-button" data-school="${esc(s.SD_SCHUL_CODE)}">${esc(s.SCHUL_NM)} ↗</button></td><td><span class="badge ${color(s.SCHUL_KND_SC_NM)}">${esc(s.SCHUL_KND_SC_NM)}</span></td><td>${esc(s.FOND_SC_NM)}</td><td>${esc(s.ORG_RDNMA)}<small>${esc(s.JU_ORG_NM)}</small></td><td>${esc(s.ORG_TELNO||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">조회 조건에 맞는 학교가 없습니다.</div>';
 $('#calendar-view').hidden=state.view!=='calendar';$('#schools-view').hidden=state.view!=='schools';
 const title=state.view==='calendar'?'관내 학사일정':'학교 정보';$('#heading').textContent=title;$('#crumb').textContent=title;$('#subtitle').textContent=state.view==='calendar'?'학교의 주요 일정을 한곳에서 확인하세요.':'관내 학교의 기본 정보와 연락처를 확인하세요.';
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
}
function eventTable(items){return items.length?`<div class="table-wrap"><table><thead><tr><th>일자</th><th>학교</th><th>일정</th></tr></thead><tbody>${items.map(e=>`<tr><td>${pretty(e.AA_YMD)}</td><td><button class="text-button" data-school="${esc(e.SD_SCHUL_CODE)}">${esc(e.SCHUL_NM)}</button><small>${esc(e.SCHUL_KND_SC_NM)}</small></td><td><button class="text-button" data-event="${state.events.indexOf(e)}">${esc(e.EVENT_NM)}</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">조회된 일정이 없습니다.<br>다른 달이나 학교급을 선택해 보세요.</div>';}
function showDetail(html){$('#detail-body').innerHTML=html;if(!$('#detail').open)$('#detail').showModal();}
const fields={ATPT_OFCDC_SC_NM:'시도교육청',SD_SCHUL_CODE:'학교 코드',ENG_SCHUL_NM:'영문 학교명',JU_ORG_NM:'관할 교육지원청',FOND_SC_NM:'설립 구분',LCTN_SC_NM:'시도명',ORG_RDNZC:'우편번호',ORG_RDNMA:'도로명 주소',ORG_RDNDA:'상세 주소',ORG_TELNO:'전화번호',ORG_FAXNO:'팩스번호',COEDU_SC_NM:'남녀공학 구분',HS_SC_NM:'고등학교 구분',HS_GNRL_BUSNS_SC_NM:'일반·전문 구분',SPCLY_PURPS_HS_ORD_NM:'특수목적고 계열',INDST_SPECL_CCCCL_EXST_YN:'산업체 특별학급',ENE_BFE_SEHF_SC_NM:'입시 전후기 구분',DGHT_SC_NM:'주야 구분',FOND_YMD:'설립일',FOAS_MEMRD:'개교기념일',LOAD_DTM:'자료 수정일'};
function safeUrl(value){try{const u=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}}
function schoolDetail(code){const s=state.schools.find(s=>s.SD_SCHUL_CODE===code);if(!s)return;const homepage=s.HMPG_ADRES?safeUrl(s.HMPG_ADRES):'';showDetail(`<p class="eyebrow">SCHOOL PROFILE ${state.demo?'· DEMO':''}</p><h2>${esc(s.SCHUL_NM)}</h2><span class="badge ${color(s.SCHUL_KND_SC_NM)}">${esc(s.SCHUL_KND_SC_NM)}</span> ${homepage?`<a class="button compact" target="_blank" rel="noreferrer" href="${esc(homepage)}">학교 홈페이지 ↗</a>`:''}<dl class="details">${Object.entries(fields).map(([key,label])=>`<div class="field"><dt>${label}</dt><dd>${esc(key.endsWith('YMD')||key==='FOAS_MEMRD'?pretty(s[key]):s[key]||'—')}</dd></div>`).join('')}</dl><section class="dialog-section"><h2>이번 달 학사일정</h2>${eventTable(state.events.filter(e=>e.SD_SCHUL_CODE===code))}</section>${s.SCHUL_KND_SC_NM==='특수학교'?`<section class="dialog-section"><h2>특수학교 시간표</h2><p>학사행사와 별도로 과정·학년·학급·교시별 수업을 조회합니다.</p><label>조회 날짜 <input id="timetable-date" type="date" value="${state.month.getFullYear()}-${String(state.month.getMonth()+1).padStart(2,'0')}-01"></label> <button class="button" id="timetable-load" data-code="${esc(code)}">시간표 조회</button><div id="timetable-result" role="status"></div></section>`:''}`);}
async function api(endpoint,params,signal){
 if(mode==='direct'){
  const key=activeKey();if(!key)throw new Error('NEIS 인증키를 입력해 주세요.');
  const fetcher=(url,init={})=>fetch(url,{...init,signal:signal&&typeof AbortSignal.any==='function'?AbortSignal.any([signal,init.signal].filter(Boolean)):init.signal});
  return fetchRows(endpoint,params,key,fetcher);
 }
 const r=await fetch('api/'+endpoint+'?'+new URLSearchParams(params),{signal});const data=await r.json();if(!r.ok)throw new Error(data.error||'조회에 실패했습니다.');return data.rows;
}
function busy(value){state.busy=value;['#load','#office','#export'].forEach(s=>$(s).disabled=value);$('#load').textContent=value?'불러오는 중…':'새로고침';$('#progress').hidden=!value;$('#load-schedules').hidden=value||state.eventsLoaded||state.demo;$('#surface').setAttribute('aria-busy',String(value));renderDistricts();}
async function loadEvents(){
 if(state.loadingSchools)return;
 scheduleController?.abort();const controller=new AbortController();scheduleController=controller;
 const revision=++state.revision;state.eventsLoaded=true;
 if(state.demo){state.events=demoEvents();state.failures=0;render();return;}
 const selected=[...state.schools];state.events=[];state.failures=0;busy(true);render();
 const start=ymd(state.month),end=ymd(new Date(state.month.getFullYear(),state.month.getMonth()+1,0));const results=[];let cursor=0,done=0,failures=0;
 notice('학교 일정을 불러오고 있습니다. 지역을 선택하면 조회 범위를 바꿀 수 있습니다.');
 await Promise.all(Array.from({length:Math.min(5,selected.length)},async()=>{while(cursor<selected.length&&!controller.signal.aborted){const school=selected[cursor++];const cacheKey=school.ATPT_OFCDC_SC_CODE+school.SD_SCHUL_CODE+start;try{let rows=eventCache.get(cacheKey);if(!rows){rows=await api('SchoolSchedule',{ATPT_OFCDC_SC_CODE:school.ATPT_OFCDC_SC_CODE,SD_SCHUL_CODE:school.SD_SCHUL_CODE,AA_FROM_YMD:start,AA_TO_YMD:end},controller.signal);eventCache.set(cacheKey,rows);}results.push(...rows.map(e=>({...e,SCHUL_KND_SC_NM:school.SCHUL_KND_SC_NM})));}catch(error){if(error.name==='AbortError')return;failures++;}done++;if(revision===state.revision){$('#progress').value=done/selected.length;notice('일정 취합 중 · '+done+' / '+selected.length+'개교');}}}));
 if(revision!==state.revision)return;
 state.events=results;state.failures=failures;busy(false);render();
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
 if(district)await loadEvents();else notice('학교 정보가 준비되었습니다. 관할 지역 버튼으로 일정을 바로 확인하세요.');
 }catch(error){state.loadingSchools=false;$('#office').value=state.loadedOffice;busy(false);notice(error.message+' 현재 표시된 데이터는 유지됩니다.',true);if(mode==='direct')$('#config-status').textContent=error.message;if(state.demo)$('#config').showModal();}
}
function startDemo(){state.revision++;state.demo=true;state.loadedOffice='K10';state.loadedDistrict='';$('#office').value='K10';state.allSchools=demoSchools();state.schools=state.allSchools;state.events=demoEvents();state.failures=0;busy(false);notice('데모 모드 · 아래 학교명과 일정은 모두 가상 자료입니다. 실제 학교 정보는 인증키 연결 후 조회하세요.');render();}
function csvCell(v){let value=String(v??'');if(/^[\s]*[=+@-]/.test(value))value="'"+value;return '"'+value.replace(/"/g,'""')+'"';}
function download(){const list=state.view==='schools'?schools():events();if(!list.length){notice('내려받을 자료가 없습니다.');return;}const cols=state.view==='schools'?{SCHUL_NM:'학교명',SCHUL_KND_SC_NM:'학교급',FOND_SC_NM:'설립',JU_ORG_NM:'관할',ORG_RDNMA:'주소',ORG_TELNO:'전화',ORG_FAXNO:'팩스',HMPG_ADRES:'홈페이지',SD_SCHUL_CODE:'학교코드'}:{AA_YMD:'날짜',SCHUL_NM:'학교명',SCHUL_KND_SC_NM:'학교급',EVENT_NM:'일정명',EVENT_CNTNT:'내용'};const text='\uFEFF'+[Object.values(cols),...list.map(x=>Object.keys(cols).map(k=>x[k]))].map(row=>row.map(csvCell).join(',')).join('\r\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8;'}));link.download=`${state.demo?'데모_':state.failures?'일부결과_':''}${state.view==='schools'?'학교정보':'학사일정'}_${ymd(state.month).slice(0,6)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
$('#load').onclick=loadSchools;
$('#load-schedules').onclick=loadEvents;
$('#office').onchange=loadSchools;
$('#settings').onclick=()=>$('#config').showModal();
$('#demo').onclick=()=>{if(state.busy)return;$('#config').close();startDemo();};
$('#search').oninput=e=>{state.query=e.target.value.trim();render();};
$('#export').onclick=download;
for(const [id,delta] of [['prev',-1],['next',1],['today',0]])$('#'+id).onclick=()=>{state.month=delta?new Date(state.month.getFullYear(),state.month.getMonth()+delta,1):new Date(now.getFullYear(),now.getMonth(),1);loadEvents();};
$('#grid-btn').onclick=()=>{state.list=false;render();};$('#list-btn').onclick=()=>{state.list=true;render();};
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-district'))await selectDistrict(b.dataset.district);
 if(b.hasAttribute('data-close'))b.closest('dialog').close();
 if(b.dataset.type){state.type=b.dataset.type;render();}
 if(b.dataset.view){state.view=b.dataset.view;render();}
 if(b.dataset.school)schoolDetail(b.dataset.school);
 if(b.dataset.day)showDetail(`<h2>${pretty(b.dataset.day)} 일정</h2>${eventTable(events().filter(x=>x.AA_YMD===b.dataset.day))}`);
 if(b.dataset.event!==undefined){const item=state.events[Number(b.dataset.event)];if(item)showDetail(`<p class="eyebrow">SCHOOL SCHEDULE ${state.demo?'· DEMO':''}</p><h2>${esc(item.EVENT_NM)}</h2><p>${pretty(item.AA_YMD)} · ${esc(item.SCHUL_NM)}</p><p>${esc(item.EVENT_CNTNT||'추가 설명이 없습니다.')}</p><button class="button" data-school="${esc(item.SD_SCHUL_CODE)}">학교 상세정보 보기 →</button>`);}
 if(b.id==='timetable-load'){
  const target=$('#timetable-result'),date=$('#timetable-date').value.replaceAll('-','');if(!date){target.textContent='조회 날짜를 선택하세요.';return;}
  if(state.demo){target.innerHTML='<p>데모에서는 시간표를 제공하지 않습니다. NEIS 인증키 연결 후 실제 특수학교를 선택하세요.</p>';return;}
  const s=state.schools.find(s=>s.SD_SCHUL_CODE===b.dataset.code);b.disabled=true;target.textContent='시간표 조회 중…';
  try{const rows=await api('spsTimetable',{ATPT_OFCDC_SC_CODE:s.ATPT_OFCDC_SC_CODE,SD_SCHUL_CODE:s.SD_SCHUL_CODE,TI_FROM_YMD:date,TI_TO_YMD:date});target.innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>과정</th><th>학년·반</th><th>교시</th><th>수업내용</th><th>강의실</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.SCHUL_CRSE_SC_NM)}</td><td>${esc(r.GRADE)}학년 ${esc(r.CLASS_NM)}반</td><td>${esc(r.PERIO)}</td><td>${esc(r.ITRT_CNTNT)}</td><td>${esc(r.CLRM_NM||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<p>해당 날짜에 공개된 시간표가 없습니다.</p>';}catch(error){target.textContent=error.message;}finally{b.disabled=false;}
 }
});
state.demo=false;render();notice('NEIS 연결을 확인하고 있습니다.');
function restoreScope(){try{state.loadedOffice=$('#office').value;state.loadedDistrict=localStorage.getItem('district')||'';}catch{}}
function keyStatus(){$('#config-status').textContent=direct.key?'이 브라우저에 저장된 개인 인증키로 NEIS에서 직접 조회합니다.':direct.shared?'공용 인증키로 NEIS에서 직접 조회합니다. 개인 인증키를 입력하면 그 키를 우선 사용합니다.':'인증키를 입력하면 실제 학교 정보와 학사일정을 조회합니다. 인증키가 없으면 데모를 둘러볼 수 있습니다.';}
async function serverStatus(){try{const r=await fetch('api/status',{cache:'no-store'});if(!r.ok||!(r.headers.get('content-type')||'').includes('json'))return null;return await r.json();}catch{return null;}}
$('#key-form').onsubmit=e=>{e.preventDefault();const key=$('#api-key').value.trim();if(!key)return;direct.key=key;try{localStorage.setItem('neisKey',key);}catch{}keyStatus();$('#config').close();restoreScope();loadSchools();};
$('#key-clear').onclick=()=>{direct.key='';$('#api-key').value='';try{localStorage.removeItem('neisKey');}catch{}keyStatus();if(!state.busy){if(activeKey())loadSchools();else startDemo();}};
serverStatus().then(data=>{
 if(data){$('#config-status').textContent=data.configured?'인증키가 설정되어 있습니다. 교육청과 지역을 선택해 조회하세요.':'현재 인증키가 설정되어 있지 않습니다.';if(data.configured){restoreScope();loadSchools();}else startDemo();return;}
 mode='direct';$('#key-form').hidden=false;$('#settings').querySelector('span').textContent='인증키 설정';$('#api-key').value=direct.key;keyStatus();
 if(activeKey()){restoreScope();loadSchools();}else{startDemo();$('#config').showModal();}
});
