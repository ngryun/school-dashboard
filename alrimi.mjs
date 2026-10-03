// 학교알리미(schoolinfo.go.kr) 공시정보 Open API 중계 공통 모듈.
// 서버(server.mjs)와 Worker(worker.mjs)에서만 사용하며 인증키는 호출 측 환경변수에서 받는다.
const BASE = 'https://www.schoolinfo.go.kr/openApi.do';
export const alrimiTypes = new Set(['09', '22']); // 09 학년별·학급별 학생수, 22 직위별 교원 현황
const NO_DATA = /없습니다|없음|공시되지 않|제공이 불가|존재하지/;
export function validateAlrimi(apiType, params, codes) {
  if (!alrimiTypes.has(apiType)) return '지원하지 않는 공시 항목입니다.';
  if (!/^\d{2}$/.test(params.sido || '') || (codes?.sido && !codes.sido.has(params.sido))) return '시도 코드가 올바르지 않습니다.';
  if (params.sgg && (!/^\d{5}$/.test(params.sgg) || (codes?.sgg && !codes.sgg.has(params.sgg)))) return '시군구 코드가 올바르지 않습니다.';
  if (!/^0[2-7]$/.test(params.kind || '')) return '학교급 코드가 올바르지 않습니다.';
  if (params.year && !/^\d{4}$/.test(params.year)) return '공시 연도 형식이 올바르지 않습니다.';
  return null;
}
export function regionCodes(regions) {
  const sido = new Set(), sgg = new Set();
  for (const region of Object.values(regions || {})) { if (region?.code) sido.add(region.code); for (const code of Object.values(region?.sgg || {})) sgg.add(code); }
  return { sido, sgg };
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
  if (!response.ok) { const error = new Error('학교알리미 서비스에 연결할 수 없습니다. 잠시 후 다시 시도하세요.'); error.code = 'UPSTREAM'; throw error; }
  let data;
  try { data = await response.json(); } catch { const error = new Error('학교알리미 응답 형식이 올바르지 않습니다.'); error.code = 'UPSTREAM'; throw error; }
  if (data.resultCode !== 'success') {
    const message = String(data.resultMsg || '');
    if (/apiKey|인증/i.test(message)) { const error = new Error('학교알리미 인증키가 유효하지 않습니다. 관리자에게 문의해 주세요.'); error.code = 'AUTH'; throw error; }
    if (NO_DATA.test(message)) return { rows: [], message, noData: true };
    const error = new Error('학교알리미 서비스 오류: ' + (message || '알 수 없는 응답')); error.code = 'UPSTREAM'; throw error;
  }
  return { rows: Array.isArray(data.list) ? data.list : [] };
}
export const alrimiErrorResponse = error => ({
  status: error.code === 'AUTH' ? 503 : 502,
  error: error.name === 'TimeoutError' ? '학교알리미 응답 시간이 초과되었습니다. 다시 시도해 주세요.' : error.code === 'AUTH' || error.code === 'UPSTREAM' ? error.message : '학교알리미 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
});
