// 공시 스냅숏(public/alrimi/<시도>-<학교급>.json)을 시도교육청 현황 화면용 요약(public/alrimi/summary.json)으로 묶는다.
// fetch-alrimi.mjs가 끝에 호출하며, 따로 실행해도 된다(node scripts/alrimi-summary.mjs).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const SMALL_SCHOOL = 60; // 소규모 학교: 학생 60명 이하(초·중·고만 집계, 특수학교 제외)

// 시도·학교급 한 파일의 요약. trend는 이력(history)의 연도별 합계(그해 학생이 있던 학교 전부, 뒤에 폐교된 학교 포함),
// moveIn·moveOut·male·female은 more(전입·전출, 성별 학생수)의 합계다.
export function summarize(data, kind) {
  // 학생이 없는 공시 행(휴교 등)은 학교 수에서 뺀다.
  const rows = data.students.filter(r => (r.COL_S_SUM || 0) > 0);
  const sum = key => rows.reduce((a, r) => a + (r[key] || 0), 0);
  const entry = { year: data.year, schools: rows.length, students: sum('COL_S_SUM'), classes: sum('COL_C_SUM'), teachers: sum('TEACH_CNT') };
  if (kind !== '05') {
    entry.small = rows.filter(r => r.COL_S_SUM <= SMALL_SCHOOL).length;
    entry.grades = Array.from({ length: kind === '02' ? 6 : 3 }, (_, i) => sum('COL_S' + (i + 1)));
  }
  if (data.history?.years?.length) {
    entry.trend = {};
    data.history.years.forEach((year, i) => {
      const list = Object.values(data.history.schools).map(h => h[i]).filter(h => h && h[0] > 0);
      if (list.length) entry.trend[year] = { schools: list.length, students: list.reduce((a, h) => a + h[0], 0), classes: list.reduce((a, h) => a + h[1], 0), teachers: list.reduce((a, h) => a + h[2], 0) };
    });
  }
  if (data.more?.schools) {
    const list = Object.values(data.more.schools), add = i => list.reduce((a, m) => a + (m[i] || 0), 0);
    if (data.more.years?.['10']) { entry.moveIn = add(0); entry.moveOut = add(1); entry.moveYear = data.more.years['10']; }
    if (data.more.years?.['63']) { entry.male = add(2); entry.female = add(3); }
  }
  return entry;
}

export async function writeSummary(dir) {
  const index = JSON.parse(await readFile(new URL('index.json', dir), 'utf8'));
  const sidos = {}, historyYears = new Set();
  for (const id of Object.keys(index.files)) {
    const [sido, kind] = id.split('-');
    const data = JSON.parse(await readFile(new URL(id + '.json', dir), 'utf8'));
    const entry = summarize(data, kind);
    for (const y of Object.keys(entry.trend || {})) historyYears.add(y);
    (sidos[sido] ??= {})[kind] = entry;
  }
  const summary = { source: index.source, fetched: index.fetched, years: index.years, historyYears: [...historyYears].sort(), smallSchool: SMALL_SCHOOL, sidos };
  await writeFile(new URL('summary.json', dir), JSON.stringify(summary));
  return summary;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const summary = await writeSummary(new URL('../public/alrimi/', import.meta.url));
  console.log(`시도 ${Object.keys(summary.sidos).length}곳 요약 저장 → public/alrimi/summary.json`);
}
