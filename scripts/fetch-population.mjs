// 입학 예정 코호트 스냅숏 수집: 행정안전부 주민등록 인구통계(jumin.mois.go.kr, 인증키 없음)의 시·군·구별 1세 단위 인구(0~7세)를
// public/population/cohort.json({시도 코드: {시·군·구: [0세, 1세, … 7세]}})에 저장한다. 지역 비교·한눈에 보기의 '입학 예정' 지표가 쓴다.
// 기준 시점은 늘 12월 말이다. 12월 말의 만 나이는 출생 연도와 1:1로 맞아(만 a세 = 기준 연도 − a년생) 초등 입학 연도(출생 연도 + 7)로 바로 옮길 수 있다.
// 다른 달의 만 나이는 두 출생 연도가 섞이므로 쓰지 않는다.
// 기준 시점 뒤에 구가 새로 생겼으면(2026-07 인천 제물포구·영종구·서해구·검단구) 기준 시점의 읍·면·동 인구를 지금의 구로 다시 묶는다.
// 사용: npm run fetch:population            (자료가 있는 가장 최근 12월)
//       npm run fetch:population -- 2025    (2025년 12월)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const AGE_MAX = 7; // 0~7세: 6년 뒤 입학(0세)부터 지금의 초1·초2 코호트(6·7세)까지
const SITE = 'https://jumin.mois.go.kr/';
const LEVEL = { district: '2', town: '3' }; // 내려받기 범위: 전체 시군구 현황 / 전체 읍면동 현황

// 내려받은 CSV(큰따옴표로 감싼 칸, 천 단위 쉼표) → [{ sido, district, town, level, ages }]
// 행정구역 칸은 '인천광역시 서구 검단동(2826068000)' 꼴이고, 코드 끝자리 0의 개수로 시도·시군구·읍면동을 가린다.
export function parseAgeCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean).map(line => [...line.matchAll(/"([^"]*)"/g)].map(m => m[1]));
  const head = lines.shift() || [];
  const cols = [];
  head.forEach((h, i) => { const m = h.match(/_계_(\d+)세/); if (m) cols[Number(m[1])] = i; });
  if (cols.length !== AGE_MAX + 1 || cols.includes(undefined)) throw new Error('연령 열을 찾지 못했습니다(자료 형식이 바뀌었을 수 있습니다).');
  const rows = [];
  for (const cells of lines) {
    const m = (cells[0] || '').match(/^(.*?)\s*\((\d{10})\)$/);
    if (!m) continue;
    const names = m[1].trim().split(/\s+/), code = m[2];
    const level = /0{8}$/.test(code) ? 'sido' : /0{5}$/.test(code) ? 'district' : 'town';
    if (level === 'sido') continue; // 시도 합계는 시·군·구를 더해 쓴다(세종은 같은 값이 시군구 코드로 한 번 더 나온다)
    const ages = cols.map(i => Number(String(cells[i] ?? '').replace(/,/g, '')) || 0);
    let sido = names[0], district = names[1] || '', town = '';
    if (level === 'town') { town = names.at(-1); if (names.length < 3) district = ''; }
    // 일반구(수원시 장안구)는 NEIS 주소의 시·군·구 칸(수원시)에 맞춰 시 합계 행만 쓰고, 출장소 행(화성시동탄출장소)은 버린다.
    // 시도 이름 없이 나오는 도 출장소 행(북부출장소)도 버린다.
    else if (names.length > 2 || /출장소$/.test(district) || /출장소$/.test(sido) || (!district && sido !== '세종특별자치시')) continue;
    // 세종은 app.js의 districtOf와 같이 '세종시' 하나로 둔다.
    if (sido === '세종특별자치시') district = '세종시';
    // 전남광주통합특별시는 자치구를 광주광역시교육청, 시·군을 전라남도교육청으로 나눈다(build-geo.mjs와 같음).
    if (sido === '전남광주통합특별시') sido = /구$/.test(district) ? '광주광역시' : '전라남도';
    rows.push({ sido, district, town, level, ages });
  }
  return rows;
}

const add = (a, b) => a.map((v, i) => v + b[i]);
const zero = () => Array.from({ length: AGE_MAX + 1 }, () => 0);
const key = r => r.sido + '|' + r.district;

// 기준 시점(base)의 시·군·구 인구를 지금(current)의 시·군·구 목록에 맞춘다. 지금만 있는 구는 그 구에 속한 읍·면·동 이름으로
// 기준 시점의 읍·면·동 인구(사라진 구에 있던 것만)를 다시 묶는다. towns는 필요할 때만 부르는 함수다({ base, current } 읍·면·동 행).
export async function alignDistricts(base, current, towns) {
  const have = new Map(base.map(r => [key(r), r.ages]));
  const now = new Set(current.map(key));
  const out = new Map(), created = current.filter(r => !have.has(key(r))).map(key);
  for (const r of current) if (have.has(key(r))) out.set(key(r), have.get(key(r)));
  const report = { regrouped: [], unmatched: [], ambiguous: [], lost: 0 };
  if (!created.length) return { out, report };
  const gone = new Set(base.map(key).filter(k => !now.has(k)));
  const t = await towns();
  // 새 구에 속한 읍·면·동 이름 → 새 구. 개편 때 이름이 바뀌거나 나뉜 동이 있어 세 단계로 맞춘다:
  // 같은 이름 → 구두점만 다른 이름(송림3.5동 = 송림3·5동) → 숫자를 뺀 이름(운서동 = 운서1동·운서2동).
  // 어느 단계에서든 후보 구가 둘 이상이면 가를 수 없으므로 맞추지 않는다.
  const forms = [n => n, n => n.replace(/[^가-힣0-9]/g, ''), n => n.replace(/[^가-힣]/g, '')];
  const owners = forms.map(() => new Map()), wanted = new Set(created);
  for (const r of t.current) {
    if (!wanted.has(key(r))) continue;
    forms.forEach((f, i) => { const k = r.sido + '|' + f(r.town); owners[i].set(k, (owners[i].get(k) || new Set()).add(key(r))); });
  }
  for (const k of created) out.set(k, zero());
  for (const r of t.base) {
    if (!gone.has(key(r))) continue;
    let hit = null;
    for (let i = 0; i < forms.length && !hit; i++) hit = owners[i].get(r.sido + '|' + forms[i](r.town));
    if (hit?.size === 1) { const [target] = hit; out.set(target, add(out.get(target), r.ages)); continue; }
    (hit ? report.ambiguous : report.unmatched).push(`${r.sido} ${r.district} ${r.town}`);
    report.lost += r.ages.reduce((a, b) => a + b, 0);
  }
  report.regrouped = created;
  return { out, report };
}

async function download(year, month, level) {
  const body = new URLSearchParams({ sltOrgType: '1', sltOrgLvl1: 'A', sltOrgLvl2: '', gender: 'gender', sum: 'sum', sltUndefType: '', searchYearStart: String(year), searchMonthStart: String(month).padStart(2, '0'), searchYearEnd: String(year), searchMonthEnd: String(month).padStart(2, '0'), sltOrderType: '1', sltOrderValue: 'ASC', sltArgTypes: '1', sltArgTypeA: '0', sltArgTypeB: String(AGE_MAX), category: 'month' });
  const res = await fetch(`${SITE}downloadCsvAge.do?searchYearMonth=month&xlsStats=${LEVEL[level]}`, { method: 'POST', body, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; population-snapshot)', Referer: SITE + 'ageStatMonth.do' }, signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`주민등록 인구통계 응답 오류(${res.status})`);
  // 응답 머리글은 utf-8이라고 하지만 실제 내용은 EUC-KR(CP949)이다.
  const rows = parseAgeCsv(new TextDecoder('euc-kr').decode(await res.arrayBuffer())).filter(r => r.level === level);
  return rows.some(r => r.ages.some(Boolean)) ? rows : [];
}

async function main() {
  const now = new Date(), asked = Number(process.argv[2]) || 0;
  // 기준: 자료가 있는 가장 최근 12월(1월 초에는 지난달 통계가 아직 없을 수 있다).
  let baseYear = asked || now.getFullYear() - 1, base = await download(baseYear, 12, 'district');
  if (!base.length && !asked) base = await download(--baseYear, 12, 'district');
  if (!base.length) throw new Error(`${baseYear}년 12월 자료가 없습니다.`);
  // 지금의 시·군·구 목록: 자료가 있는 가장 최근 달.
  let current = [], curYear = now.getFullYear(), curMonth = now.getMonth() + 1;
  for (let i = 0; i < 4 && !current.length; i++) {
    if (--curMonth < 1) { curMonth = 12; curYear--; }
    current = curYear * 12 + curMonth > baseYear * 12 + 12 ? await download(curYear, curMonth, 'district') : base;
  }
  if (!current.length) throw new Error('최근 달 자료를 받지 못했습니다.');
  const { out, report } = await alignDistricts(base, current, async () => ({ base: await download(baseYear, 12, 'town'), current: await download(curYear, curMonth, 'town') }));

  const regions = JSON.parse(await readFile(new URL('../public/regions.json', import.meta.url), 'utf8'));
  const sidos = {}, regrouped = {};
  for (const [k, ages] of out) {
    const [sido, district] = k.split('|'), code = regions[sido]?.code;
    if (!code) { console.warn('시도 코드를 알 수 없음:', sido); continue; }
    (sidos[code] ??= {})[district] = ages;
    if (report.regrouped.includes(k)) (regrouped[code] ??= []).push(district);
  }
  // 받은 합계가 전국 합계와 같아야 한다(다시 묶다가 빠진 인구가 없는지).
  const total = rows => rows.reduce((a, r) => add(a, r.ages), zero());
  const want = total(base), got = total([...out.values()].map(ages => ({ ages })));
  const diff = want.map((v, i) => v - got[i]);
  const dir = new URL('../public/population/', import.meta.url);
  await mkdir(dir, { recursive: true });
  const snapshot = { source: '행정안전부 주민등록 인구통계', base: `${baseYear}-12`, districtsAsOf: `${curYear}-${String(curMonth).padStart(2, '0')}`, fetched: now.toISOString().slice(0, 10), regrouped, sidos };
  await writeFile(new URL('cohort.json', dir), JSON.stringify(snapshot));
  console.log(`${baseYear}년 12월 기준 0~${AGE_MAX}세 · 시도 ${Object.keys(sidos).length}곳 · 시·군·구 ${out.size}곳(${curYear}-${String(curMonth).padStart(2, '0')} 행정구역) → public/population/cohort.json`);
  console.log('전국 0~7세:', want.join(' '));
  if (report.regrouped.length) console.log('읍·면·동으로 다시 묶은 구:', report.regrouped.join(', '));
  if (report.ambiguous.length) console.warn('새 구 둘 이상에 걸쳐 가르지 못한 읍·면·동:', report.ambiguous.join(', '));
  if (report.unmatched.length) console.warn('새 구를 찾지 못한 읍·면·동:', report.unmatched.join(', '));
  if (report.lost) console.warn(`어느 구에도 넣지 못한 0~${AGE_MAX}세: ${report.lost}명`);
  if (diff.some(Boolean)) { console.warn('전국 합계와 차이(0~7세):', diff.join(' ')); process.exitCode = 1; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
