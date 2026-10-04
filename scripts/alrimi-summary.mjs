// 공시 스냅숏(public/alrimi/<시도>-<학교급>.json)을 시도교육청 현황 화면용 요약(public/alrimi/summary.json)으로 묶는다.
// fetch-alrimi.mjs가 끝에 호출하며, 따로 실행해도 된다(node scripts/alrimi-summary.mjs).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const SMALL_SCHOOL = 60; // 소규모 학교: 학생 60명 이하(초·중·고만 집계, 특수학교 제외)

export async function writeSummary(dir) {
  const index = JSON.parse(await readFile(new URL('index.json', dir), 'utf8'));
  const sidos = {};
  for (const id of Object.keys(index.files)) {
    const [sido, kind] = id.split('-');
    const data = JSON.parse(await readFile(new URL(id + '.json', dir), 'utf8'));
    // 학생이 없는 공시 행(휴교 등)은 학교 수에서 뺀다.
    const rows = data.students.filter(r => (r.COL_S_SUM || 0) > 0);
    const sum = key => rows.reduce((a, r) => a + (r[key] || 0), 0);
    const entry = { year: data.year, schools: rows.length, students: sum('COL_S_SUM'), classes: sum('COL_C_SUM'), teachers: sum('TEACH_CNT') };
    if (kind !== '05') {
      entry.small = rows.filter(r => r.COL_S_SUM <= SMALL_SCHOOL).length;
      entry.grades = Array.from({ length: kind === '02' ? 6 : 3 }, (_, i) => sum('COL_S' + (i + 1)));
    }
    (sidos[sido] ??= {})[kind] = entry;
  }
  const summary = { source: index.source, fetched: index.fetched, years: index.years, smallSchool: SMALL_SCHOOL, sidos };
  await writeFile(new URL('summary.json', dir), JSON.stringify(summary));
  return summary;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const summary = await writeSummary(new URL('../public/alrimi/', import.meta.url));
  console.log(`시도 ${Object.keys(summary.sidos).length}곳 요약 저장 → public/alrimi/summary.json`);
}
