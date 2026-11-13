// 학교알리미 공시 스냅숏 수집: 시도·학교급마다 공시 항목을 받아 public/alrimi/<시도>-<학교급>.json에 저장한다.
//  - 09 학년별·학급별 학생수(students), 22 직위별 교원 현황(staff): 최신 공시 1개 연도, 화면이 읽는 열만.
//  - history: 09의 학교별 [학생, 학급, 교사]를 연도마다 쌓은 이력. OpenAPI는 최근 3년만 주므로
//    이전 파일의 이력을 읽어 합친다(해마다 실행하면 4년, 5년으로 늘어난다). 최신 연도에 없는 학교(폐교·통합)는 gone에 이름·지역을 남긴다.
//  - more: 10 전입·전출, 63 성별 학생수, 68 직원 현황의 학교별 합계.
// 학교알리미는 Cloudflare 같은 해외 클라우드에서 오는 접속을 대부분 끊어(2026-10-04 Worker 시험 8회 중 7회 연결 실패)
// 실시간 중계가 불안정하다. 공시는 연 1회(4월 1일 기준) 바뀌므로 국내 PC에서 공시 갱신 뒤 한 번 실행해 커밋한다.
// 사용: npm run fetch:alrimi  (.env의 ALRIMI_API_KEY 사용, 올해 공시가 없으면 작년 공시)
// 실패한 시도·학교급은 이전 파일을 그대로 두므로(이력 보존) 다시 실행하면 된다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fetchAlrimi } from '../alrimi.mjs';
import { writeSummary } from './alrimi-summary.mjs';

const key = process.env.ALRIMI_API_KEY;
const out = new URL('../public/alrimi/', import.meta.url);
const kinds = ['02', '03', '04', '05'];
const API_YEARS = 3; // 학교알리미 OpenAPI가 제공하는 연도 수(최근 3년)
// 화면이 읽는 열만 남기고 0·빈 값은 뺀다(app.js의 parseStudents·parseStaff가 없는 열을 0/빈 값으로 다룬다).
const keep = {
  '09': /^(SCHUL_NM|SCHUL_CODE|ADRCD_NM|SCHUL_KND_SC_CODE|COL_[CS]?\d+|COL_[CS]_SUM|COL_SUM|TEACH_CNT|TEACH_CAL)$/,
  '22': /^(SCHUL_NM|SCHUL_CODE|ADRCD_NM|COL_\d+|COL_S|COL_R_SUM)$/,
};
const trim = (rows, re) => rows.map(r => Object.fromEntries(Object.entries(r).filter(([k, v]) => re.test(k) && v !== null && v !== '' && v !== 0)));
const thisYear = new Date().getFullYear();
const n = v => { const x = Number(String(v ?? '').replace(/,/g, '').trim()); return Number.isFinite(x) ? x : 0; };
const first = (r, ...keys) => { for (const k of keys) if (r[k] != null && r[k] !== '') return n(r[k]); return 0; };

const get = (apiType, sido, kind, year) => fetchAlrimi(apiType, { sido, kind, year: String(year) }, key).then(r => r.rows);
async function latest(apiType, sido, kind, years) {
  for (const year of years) {
    const rows = await get(apiType, sido, kind, year);
    if (rows.length) return { year: String(year), rows };
  }
  return { year: '', rows: [] };
}
// 09 한 행 → [학생, 학급, 교사]. 특수학교는 총계 열 이름이 다르다(app.js parseStudents와 같은 순서).
export const triple = r => [first(r, 'COL_S_SUM', 'COL_SUM_S4'), first(r, 'COL_C_SUM', 'COL_SUM_C4'), n(r.TEACH_CNT)];

// 이전 이력(prev)에 이번에 받은 연도별 행(byYear: {연도: rows})을 합친다. 같은 연도는 새로 받은 값이 이긴다.
export function mergeHistory(prev, byYear, latestYear) {
  const years = [...new Set([...(prev?.years || []), ...Object.keys(byYear)])].sort();
  const schools = {}, gone = { ...(prev?.gone || {}) }, names = {};
  for (const [code, list] of Object.entries(prev?.schools || {})) schools[code] = years.map(y => { const i = prev.years.indexOf(y); return i < 0 ? null : list[i] ?? null; });
  for (const [year, rows] of Object.entries(byYear)) {
    const i = years.indexOf(year);
    for (const r of rows) { const code = String(r.SCHUL_CODE || ''); if (!code) continue; (schools[code] ??= years.map(() => null))[i] = triple(r); names[code] = [r.SCHUL_NM || '', r.ADRCD_NM || '']; }
  }
  const current = new Set((byYear[latestYear] || []).map(r => String(r.SCHUL_CODE || '')));
  for (const code of Object.keys(schools)) { if (current.has(code)) delete gone[code]; else if (names[code]) gone[code] = names[code]; }
  return { years, schools, gone };
}

// 10·63·68 → {정보공시 학교코드: [전입, 전출, 남학생, 여학생, 일반직, 별정직, 교육공무직]}. 받지 못한 항목은 null.
export function mergeMore(parts) {
  const schools = {}, slot = (code, i, v) => { (schools[code] ??= Array(7).fill(null))[i] = v; };
  for (const r of parts['10'] || []) { const c = String(r.SCHUL_CODE || ''); if (!c) continue; slot(c, 0, n(r.MVIN_SUM)); slot(c, 1, n(r.MVT_SUM)); }
  for (const r of parts['63'] || []) { const c = String(r.SCHUL_CODE || ''); if (!c) continue; slot(c, 2, first(r, 'COL_MSUM4', 'COL_MSUM')); slot(c, 3, first(r, 'COL_WSUM4', 'COL_WSUM')); }
  for (const r of parts['68'] || []) { const c = String(r.SCHUL_CODE || ''); if (!c) continue; slot(c, 4, n(r.SUM_1)); slot(c, 5, n(r.SUM_2)); slot(c, 6, n(r.SUM_3)); }
  return schools;
}

async function main() {
  if (!key) { console.error('.env에 ALRIMI_API_KEY를 넣고 다시 실행하세요.'); process.exit(1); }
  const regions = JSON.parse(await readFile(new URL('../public/regions.json', import.meta.url), 'utf8'));
  // 전남광주통합특별시(12)는 전라남도(46)·광주광역시(29) 자료를 합친 중복이다. NEIS는 두 교육청을 따로 쓰므로 받지 않는다.
  const skip = new Set(['전남광주통합특별시']);
  const tasks = Object.entries(regions).filter(([name]) => !skip.has(name)).flatMap(([name, region]) => kinds.map(kind => ({ name, sido: region.code, kind })));
  const readJson = async url => { try { return JSON.parse(await readFile(url, 'utf8')); } catch { return null; } };
  const files = { ...((await readJson(new URL('index.json', out)))?.files || {}) };
  let cursor = 0, failed = 0;
  await mkdir(out, { recursive: true });
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < tasks.length) {
      const { name, sido, kind } = tasks[cursor++], id = sido + '-' + kind;
      try {
        const students = await latest('09', sido, kind, [thisYear, thisYear - 1]);
        if (!students.rows.length) continue;
        const year = Number(students.year);
        const staff = await latest('22', sido, kind, [year, year - 1]);
        const byYear = { [students.year]: students.rows };
        for (let y = year - 1; y > year - API_YEARS; y--) { const rows = await get('09', sido, kind, y); if (rows.length) byYear[y] = rows; }
        const history = mergeHistory((await readJson(new URL(id + '.json', out)))?.history, byYear, students.year);
        const parts = {}, moreYears = {};
        for (const t of ['10', '63', '68']) { const r = await latest(t, sido, kind, [year, year - 1]); parts[t] = r.rows; if (r.year) moreYears[t] = r.year; }
        const more = { years: moreYears, schools: mergeMore(parts) };
        await writeFile(new URL(id + '.json', out), JSON.stringify({ year: students.year, staffYear: staff.year, students: trim(students.rows, keep['09']), staff: trim(staff.rows, keep['22']), history, more }));
        files[id] = students.year;
        console.log(`${name} ${kind}: ${students.year} 공시 ${students.rows.length}개교 · 교원 ${staff.rows.length}개교 · 이력 ${history.years.join('·')}(폐교·통합 ${Object.keys(history.gone).length}) · 전출입 ${parts['10'].length} · 성별 ${parts['63'].length} · 직원 ${parts['68'].length}`);
      } catch (error) {
        failed++;
        console.error(`${name} ${kind}: ${error.message} (이전 파일 유지)`);
      }
    }
  }));
  const sorted = Object.fromEntries(Object.entries(files).sort());
  await writeFile(new URL('index.json', out), JSON.stringify({ source: '학교알리미 공시정보(한국교육학술정보원)', fetched: new Date().toISOString().slice(0, 10), years: [...new Set(Object.values(sorted))].sort(), files: sorted }, null, 1) + '\n');
  const summary = await writeSummary(out);
  console.log(`${Object.keys(sorted).length}개 파일과 summary.json 저장 → public/alrimi/ (이력 ${summary.historyYears.join('·')})` + (failed ? ` (실패 ${failed}건, 다시 실행하세요)` : ''));
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
