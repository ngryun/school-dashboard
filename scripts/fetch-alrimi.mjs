// 학교알리미 공시 스냅숏 수집: 시도·학교급마다 09(학년별·학급별 학생수)와 22(직위별 교원 현황)를 받아 public/alrimi/에 저장한다.
// 학교알리미는 Cloudflare 같은 해외 클라우드에서 오는 접속을 대부분 끊어(2026-10-04 Worker 시험 8회 중 7회 연결 실패)
// 실시간 중계가 불안정하다. 공시는 연 1회(4월 1일 기준) 바뀌므로 국내 PC에서 공시 갱신 뒤 한 번 실행해 커밋한다.
// 사용: npm run fetch:alrimi  (.env의 ALRIMI_API_KEY 사용, 올해 공시가 없으면 작년 공시)
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fetchAlrimi } from '../alrimi.mjs';
import { writeSummary } from './alrimi-summary.mjs';

const key = process.env.ALRIMI_API_KEY;
if (!key) { console.error('.env에 ALRIMI_API_KEY를 넣고 다시 실행하세요.'); process.exit(1); }
const regions = JSON.parse(await readFile(new URL('../public/regions.json', import.meta.url), 'utf8'));
const out = new URL('../public/alrimi/', import.meta.url);
const kinds = ['02', '03', '04', '05'];
// 화면이 읽는 열만 남기고 0·빈 값은 뺀다(app.js의 parseStudents·parseStaff가 없는 열을 0/빈 값으로 다룬다).
const keep = {
  '09': /^(SCHUL_NM|SCHUL_CODE|ADRCD_NM|SCHUL_KND_SC_CODE|COL_[CS]?\d+|COL_[CS]_SUM|COL_SUM|TEACH_CNT|TEACH_CAL)$/,
  '22': /^(SCHUL_NM|SCHUL_CODE|ADRCD_NM|COL_\d+|COL_S|COL_R_SUM)$/,
};
const trim = (rows, re) => rows.map(r => Object.fromEntries(Object.entries(r).filter(([k, v]) => re.test(k) && v !== null && v !== '' && v !== 0)));
const thisYear = new Date().getFullYear();

async function latest(apiType, sido, kind, years) {
  for (const year of years) {
    const result = await fetchAlrimi(apiType, { sido, kind, year: String(year) }, key);
    if (result.rows.length) return { year: String(year), rows: trim(result.rows, keep[apiType]) };
  }
  return { year: '', rows: [] };
}

// 전남광주통합특별시(12)는 전라남도(46)·광주광역시(29) 자료를 합친 중복이다. NEIS는 두 교육청을 따로 쓰므로 받지 않는다.
const skip = new Set(['전남광주통합특별시']);
const tasks = Object.entries(regions).filter(([name]) => !skip.has(name)).flatMap(([name, region]) => kinds.map(kind => ({ name, sido: region.code, kind })));
const files = {};
let cursor = 0, failed = 0;
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < tasks.length) {
    const { name, sido, kind } = tasks[cursor++];
    try {
      const students = await latest('09', sido, kind, [thisYear, thisYear - 1]);
      if (!students.rows.length) continue;
      const staff = await latest('22', sido, kind, [Number(students.year), Number(students.year) - 1]);
      const id = sido + '-' + kind;
      await writeFile(new URL(id + '.json', out), JSON.stringify({ year: students.year, staffYear: staff.year, students: students.rows, staff: staff.rows }));
      files[id] = students.year;
      console.log(`${name} ${kind}: ${students.year} 공시 ${students.rows.length}개교 · 교원 ${staff.rows.length}개교`);
    } catch (error) {
      failed++;
      console.error(`${name} ${kind}: ${error.message}`);
    }
  }
}));
const sorted = Object.fromEntries(Object.entries(files).sort());
await writeFile(new URL('index.json', out), JSON.stringify({ source: '학교알리미 공시정보(한국교육학술정보원)', fetched: new Date().toISOString().slice(0, 10), years: [...new Set(Object.values(sorted))].sort(), files: sorted }, null, 1) + '\n');
await writeSummary(out);
console.log(`${Object.keys(sorted).length}개 파일과 summary.json 저장 → public/alrimi/` + (failed ? ` (실패 ${failed}건, 다시 실행하세요)` : ''));
if (failed) process.exitCode = 1;
