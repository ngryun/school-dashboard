const allowed = new Set(['ATPT_OFCDC_SC_CODE','SD_SCHUL_CODE','AA_FROM_YMD','AA_TO_YMD','TI_FROM_YMD','TI_TO_YMD']);
export async function fetchRows(endpoint, params, key, fetcher = fetch) {
  const rows=[];
  for(let page=1;page<=100;page++) {
    const url=new URL('https://open.neis.go.kr/hub/'+endpoint);
    for(const [k,v] of Object.entries(params)) if(allowed.has(k)) url.searchParams.set(k,v);
    for(const [k,v] of Object.entries({KEY:key,Type:'json',pIndex:page,pSize:1000})) url.searchParams.set(k,v);
    const response=await fetcher(url,{signal:AbortSignal.timeout(20000)});
    if(!response.ok) throw new Error('NEIS 서비스에 연결할 수 없습니다. 잠시 후 다시 시도하세요.');
    const data=await response.json();
    const result=data.RESULT || data[endpoint]?.[0]?.head?.find(x=>x.RESULT)?.RESULT;
    if(result?.CODE==='INFO-200') return rows;
    if(result && result.CODE!=='INFO-000') throw new Error('NEIS 응답 오류 ('+result.CODE+'). 인증키와 조회 조건을 확인하세요.');
    const batch=data[endpoint]?.find(x=>x.row)?.row;
    if(!Array.isArray(batch)) throw new Error('NEIS 응답 형식이 올바르지 않습니다.');
    rows.push(...batch);
    const total=data[endpoint]?.[0]?.head?.find(x=>x.list_total_count!==undefined)?.list_total_count;
    if(total!==undefined && rows.length>=Number(total) || batch.length<1000) return rows;
  }
  throw new Error('조회 범위가 너무 큽니다. 범위를 줄여 주세요.');
}
