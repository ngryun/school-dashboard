import { fetchRows } from './public/neis.mjs';
const endpoints={schoolInfo:['ATPT_OFCDC_SC_CODE'],SchoolSchedule:['ATPT_OFCDC_SC_CODE','SD_SCHUL_CODE','AA_FROM_YMD','AA_TO_YMD'],spsTimetable:['ATPT_OFCDC_SC_CODE','SD_SCHUL_CODE','TI_FROM_YMD','TI_TO_YMD'],classInfo:['ATPT_OFCDC_SC_CODE','SD_SCHUL_CODE','AY']};
const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(request.method!=='GET'&&request.method!=='HEAD')return json(405,{error:'지원하지 않는 요청입니다.'});
  if(url.pathname==='/api/status')return json(200,{configured:!!env.NEIS_API_KEY});
  if(url.pathname.startsWith('/api/')){
   const endpoint=url.pathname.slice(5),required=endpoints[endpoint];
   if(!required)return json(404,{error:'지원하지 않는 요청입니다.'});
   if(!env.NEIS_API_KEY)return json(503,{error:'데이터 연결 설정이 필요합니다. 관리자에게 문의해 주세요.'});
   const params=Object.fromEntries(url.searchParams);
   if(required.some(k=>!params[k]))return json(400,{error:'필수 조회 조건이 없습니다.'});
   if(!/^[A-Z]\d{2}$/.test(params.ATPT_OFCDC_SC_CODE))return json(400,{error:'교육청 코드가 올바르지 않습니다.'});
   if(params.SD_SCHUL_CODE&&!/^\d{7,10}$/.test(params.SD_SCHUL_CODE))return json(400,{error:'학교 코드가 올바르지 않습니다.'});
   for(const k of Object.keys(params).filter(k=>k.endsWith('YMD')))if(!/^\d{8}$/.test(params[k]))return json(400,{error:'날짜 형식이 올바르지 않습니다.'});
   if(params.AY&&!/^\d{4}$/.test(params.AY))return json(400,{error:'학년도 형식이 올바르지 않습니다.'});
   if(endpoint==='SchoolSchedule'||endpoint==='spsTimetable'){
    const from=params.AA_FROM_YMD||params.TI_FROM_YMD,to=params.AA_TO_YMD||params.TI_TO_YMD;
    const parse=s=>Date.parse(s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8));
    const span=parse(to)-parse(from);
    if(!Number.isFinite(span)||span<0||span>31*86400000)return json(400,{error:'최대 한 달 범위로 조회해 주세요.'});
   }
   const cacheUrl=new URL(url.origin+'/api/'+endpoint);for(const k of required)cacheUrl.searchParams.set(k,params[k]);
   const cache=globalThis.caches?.default,cacheKey=new Request(cacheUrl);
   const cached=cache?await cache.match(cacheKey):null;if(cached)return cached;
   try{
    const rows=await fetchRows(endpoint,params,env.NEIS_API_KEY);
    const response=json(200,{rows});response.headers.set('cache-control','public, max-age=600');
    if(cache)ctx.waitUntil(cache.put(cacheKey,response.clone()));return response;
   }catch(error){return json(502,{error:error.name==='TimeoutError'?'NEIS 응답 시간이 초과되었습니다. 다시 시도해 주세요.':'NEIS 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.'});}
  }
  const asset=ASSETS[url.pathname];if(!asset)return json(404,{error:'페이지가 없습니다.'});
  return new Response(request.method==='HEAD'?null:asset.body,{headers:{'content-type':asset.type,'cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'"}});
 }
};
