import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const endpoints = { schoolInfo: ['ATPT_OFCDC_SC_CODE'], SchoolSchedule: ['ATPT_OFCDC_SC_CODE','SD_SCHUL_CODE','AA_FROM_YMD','AA_TO_YMD'], spsTimetable: ['ATPT_OFCDC_SC_CODE','SD_SCHUL_CODE','TI_FROM_YMD','TI_TO_YMD'], classInfo: ['ATPT_OFCDC_SC_CODE','SD_SCHUL_CODE','AY'] };
export {fetchRows} from './public/neis.mjs';
import {fetchRows} from './public/neis.mjs';
export {fetchAlrimi, validateAlrimi} from './alrimi.mjs';
import {fetchAlrimi, validateAlrimi} from './alrimi.mjs';
const staticFiles={'/':'index.html','/app.js':'app.js','/neis.mjs':'neis.mjs','/config.js':'config.js','/style.css':'style.css','/favicon.svg':'favicon.svg','/regions.json':'regions.json'};
const server=http.createServer(async(req,res)=>{
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 try {
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/status') return send(200,{configured:!!process.env.NEIS_API_KEY});
  if(url.pathname==='/api/alrimi/status') return send(200,{configured:!!process.env.ALRIMI_API_KEY});
  if(url.pathname.startsWith('/api/alrimi/')) {
   const apiType=url.pathname.slice(12),params={sido:url.searchParams.get('sido')||'',sgg:url.searchParams.get('sgg')||'',kind:url.searchParams.get('kind')||'',year:url.searchParams.get('year')||''};
   const invalid=validateAlrimi(apiType,params); if(invalid) return send(400,{error:invalid});
   if(!process.env.ALRIMI_API_KEY) return send(503,{error:'.env 파일에 ALRIMI_API_KEY를 설정한 뒤 서버를 다시 실행해 주세요.'});
   try { return send(200,await fetchAlrimi(apiType,params,process.env.ALRIMI_API_KEY)); }
   catch(error) { return send(error.code==='AUTH'?503:502,{error:error.name==='TimeoutError'?'학교알리미 응답 시간이 초과되었습니다. 다시 시도해 주세요.':error.message}); }
  }
  if(url.pathname.startsWith('/api/')) {
   const endpoint=url.pathname.slice(5);
   if(req.method!=='GET'||!endpoints[endpoint]) return send(404,{error:'지원하지 않는 요청입니다.'});
   const key=process.env.NEIS_API_KEY;
   if(!key) return send(503,{error:'.env 파일에 NEIS_API_KEY를 설정한 뒤 서버를 다시 실행해 주세요.'});
   const params=Object.fromEntries(url.searchParams);
   if(endpoints[endpoint].some(k=>!params[k])) return send(400,{error:'필수 조회 조건이 없습니다.'});
   if(!/^[A-Z]\d{2}$/.test(params.ATPT_OFCDC_SC_CODE)) return send(400,{error:'교육청 코드가 올바르지 않습니다.'});
   if(params.SD_SCHUL_CODE&&!/^\d{7,10}$/.test(params.SD_SCHUL_CODE)) return send(400,{error:'학교 코드가 올바르지 않습니다.'});
   for(const k of Object.keys(params).filter(k=>k.endsWith('YMD'))) if(!/^\d{8}$/.test(params[k])) return send(400,{error:'날짜 형식이 올바르지 않습니다.'});
   if(params.AY&&!/^\d{4}$/.test(params.AY)) return send(400,{error:'학년도 형식이 올바르지 않습니다.'});
   return send(200,{rows:await fetchRows(endpoint,params,key)});
  }
  if(!staticFiles[url.pathname]) return send(404,{error:'페이지가 없습니다.'});
  const file=staticFiles[url.pathname], content=await readFile(new URL('public/'+file,import.meta.url));
  res.writeHead(200,{'Content-Type':/\.m?js$/.test(file)?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.json')?'application/json; charset=utf-8':file.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff'}); res.end(content);
 } catch(error) {send(502,{error:error.name==='TimeoutError'?'NEIS 응답 시간이 초과되었습니다. 다시 시도하세요.':error.message});}
});
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) server.listen(Number(process.env.PORT)||3210,'127.0.0.1',()=>console.log('EducationSpecialist → http://127.0.0.1:'+(process.env.PORT||3210)));
