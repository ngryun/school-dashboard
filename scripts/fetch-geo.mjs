// 학교 위치 스냅숏 수집: 학교알리미 학교기본정보(apiType 0)의 위도(LTTUD)·경도(LGTUD)를 시도마다
// public/geo/schools-<시도코드>.json({정보공시 학교코드: [위도, 경도]})에 저장한다. 학교 지도 화면이 쓴다.
// 학교알리미가 해외 클라우드 접속을 끊으므로(fetch-alrimi.mjs 참고) 국내 PC에서 실행해 커밋한다. 학교 신설·이전 때만 다시 받으면 된다.
// 사용: npm run fetch:geo  (.env의 ALRIMI_API_KEY 사용)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fetchAlrimi } from '../alrimi.mjs';

const key = process.env.ALRIMI_API_KEY;
if (!key) { console.error('.env에 ALRIMI_API_KEY를 넣고 다시 실행하세요.'); process.exit(1); }
const regions = JSON.parse(await readFile(new URL('../public/regions.json', import.meta.url), 'utf8'));
const out = new URL('../public/geo/', import.meta.url);
const kinds = ['02', '03', '04', '05'];
const thisYear = new Date().getFullYear();
// 전남광주통합특별시(12)는 전라남도(46)·광주광역시(29) 자료를 합친 중복이라 받지 않는다(fetch-alrimi.mjs와 같음).
const skip = new Set(['전남광주통합특별시']);
const coord = v => { const n = Number(v); return Number.isFinite(n) && n ? Math.round(n * 1e5) / 1e5 : null; };

await mkdir(out, { recursive: true });
let failed = 0;
const sidos = Object.entries(regions).filter(([name]) => !skip.has(name));
await Promise.all(Array.from({ length: 4 }, async (_, worker) => {
  for (let i = worker; i < sidos.length; i += 4) {
    const [name, region] = sidos[i], points = {};
    let total = 0, missing = 0;
    try {
      for (const kind of kinds) {
        for (const year of [thisYear, thisYear - 1]) {
          const { rows } = await fetchAlrimi('0', { sido: region.code, kind, year: String(year) }, key);
          if (!rows.length) continue;
          for (const r of rows) {
            if (!r.SCHUL_CODE || r.CLOSE_YN === 'Y') continue;
            total++;
            const lat = coord(r.LTTUD), lng = coord(r.LGTUD);
            // 우리나라 범위를 벗어난 값(0, 뒤바뀐 위경도)은 버린다.
            if (lat > 33 && lat < 39 && lng > 124 && lng < 132) points[r.SCHUL_CODE] = [lat, lng]; else missing++;
          }
          break;
        }
      }
      await writeFile(new URL('schools-' + region.code + '.json', out), JSON.stringify(points));
      console.log(`${name}: ${total}개교 중 좌표 ${total - missing}개교`);
    } catch (error) {
      failed++;
      console.error(`${name}: ${error.message}`);
    }
  }
}));
console.log('public/geo/schools-*.json 저장' + (failed ? ` (실패 ${failed}건, 다시 실행하세요)` : ''));
if (failed) process.exitCode = 1;
