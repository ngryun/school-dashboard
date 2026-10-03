// 학교알리미(schoolinfo.go.kr) 공시정보 Open API 중계 공통 모듈.
// 서버(server.mjs)와 Worker(worker.mjs)에서만 사용하며 인증키는 호출 측 환경변수에서 받는다.
const BASE = 'https://www.schoolinfo.go.kr/openApi.do';
export const alrimiTypes = new Set(['0', '09', '22', '62', '63', '68']);
export function validateAlrimi(apiType, params) {
  if (!alrimiTypes.has(apiType)) return '지원하지 않는 공시 항목입니다.';
  if (!/^\d{2}$/.test(params.sido || '')) return '시도 코드가 올바르지 않습니다.';
  if (params.sgg && !/^\d{5}$/.test(params.sgg)) return '시군구 코드가 올바르지 않습니다.';
  if (!/^0[2-7]$/.test(params.kind || '')) return '학교급 코드가 올바르지 않습니다.';
  if (params.year && !/^\d{4}$/.test(params.year)) return '공시 연도 형식이 올바르지 않습니다.';
  return null;
}
export async function fetchAlrimi(apiType, params, key, fetcher = fetch) {
  const url = new URL(BASE);
  url.searchParams.set('apiKey', key);
  url.searchParams.set('apiType', apiType);
  url.searchParams.set('sidoCode', params.sido);
  if (params.sgg) url.searchParams.set('sggCode', params.sgg);
  url.searchParams.set('schulKndCode', params.kind);
  if (params.year) url.searchParams.set('pbanYr', params.year);
  const response = await fetcher(url, { signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'school-dashboard/1.0' } });
  if (!response.ok) throw new Error('학교알리미 서비스에 연결할 수 없습니다. 잠시 후 다시 시도하세요.');
  const data = await response.json();
  if (data.resultCode !== 'success') {
    const message = String(data.resultMsg || '');
    if (/apiKey|인증/i.test(message)) { const error = new Error('학교알리미 인증키가 유효하지 않습니다. 관리자에게 문의해 주세요.'); error.code = 'AUTH'; throw error; }
    return { rows: [], message };
  }
  return { rows: Array.isArray(data.list) ? data.list : [] };
}
