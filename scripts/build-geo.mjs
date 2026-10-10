// 시·군·구 경계 만들기: 행정동 경계(vuski/admdongkor, 통계청 행정동 경계 가공본)를 NEIS 주소의 시·군·구 단위로 합치고
// 단순화한 뒤 교육청마다 SVG 경로로 미리 투영해 public/geo/<교육청 코드>.json에 저장한다. 행정구역이 바뀔 때만 다시 만든다.
// 사용: node scripts/build-geo.mjs <HangJeongDong_verYYYYMMDD.geojson>
//   원본: https://github.com/vuski/admdongkor (가장 최근 verYYYYMMDD 폴더). mapshaper는 npx로 받아 쓴다.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';

const src = process.argv[2];
if (!src) { console.error('사용: node scripts/build-geo.mjs <HangJeongDong_verYYYYMMDD.geojson>'); process.exit(1); }
const version = (basename(src).match(/ver(\d{8})/) || [])[1] || '';
const out = new URL('../public/geo/', import.meta.url);

// 시도 이름 → NEIS 교육청 코드. 전남광주통합특별시는 자치구를 광주광역시교육청(F10), 시·군을 전라남도교육청(Q10)으로 나눈다.
const officeOf = { 서울특별시: 'B10', 부산광역시: 'C10', 대구광역시: 'D10', 인천광역시: 'E10', 대전광역시: 'G10', 울산광역시: 'H10', 세종특별자치시: 'I10', 경기도: 'J10', 강원특별자치도: 'K10', 충청북도: 'M10', 충청남도: 'N10', 전북특별자치도: 'P10', 경상북도: 'R10', 경상남도: 'S10', 제주특별자치도: 'T10' };
const office = p => p.sidonm === '전남광주통합특별시' ? (/구$/.test(p.sggnm) ? 'F10' : 'Q10') : officeOf[p.sidonm];
// 일반구(수원시장안구)는 NEIS 주소의 시·군·구 칸(수원시)에 맞춰 시로 합친다. 세종은 app.js의 districtOf와 같이 '세종시'.
const district = p => p.sidonm === '세종특별자치시' ? '세종시' : p.sggnm.replace(/^(.+?시).+구$/, '$1');
// 본토에서 멀리 떨어진 섬(울릉도·독도, 백령·대청·소청도)은 지도가 지나치게 넓어지지 않도록 본토 가까이로 옮겨 그린다(점선 상자로 표시).
// lng·lat: 옮길 범위, dx·dy: 경도·위도로 옮기는 양. app.js는 이 범위 안의 학교 좌표도 같이 옮긴다.
const insets = {
  R10: [{ name: '울릉군', lng: [130.7, 132], lat: [37.1, 37.7], dx: -1.15, dy: -0.35 }],
  E10: [{ name: '옹진군', lng: [124.5, 125.0], lat: [37.6, 38.1], dx: 0.75, dy: -0.1 }],
};

const raw = JSON.parse(await readFile(src, 'utf8'));
const work = join(tmpdir(), 'school-geo-' + process.pid);
await mkdir(work, { recursive: true });
const tagged = { type: 'FeatureCollection', features: [] };
for (const f of raw.features) {
  const p = f.properties, code = office(p);
  if (!code) { console.warn('교육청을 알 수 없는 시도:', p.sidonm); continue; }
  tagged.features.push({ type: 'Feature', properties: { office: code, name: district(p) }, geometry: f.geometry });
}
await writeFile(join(work, 'in.json'), JSON.stringify(tagged));
// dissolve는 행정동 사이의 미세한 틈·겹침을 메워 합친다(작은 섬도 지우지 않는다). interval은 단순화 허용 오차(미터)다.
const run = spawnSync('npx', ['--yes', 'mapshaper@0.7.61', join(work, 'in.json'), '-dissolve', 'office,name', '-simplify', 'interval=120', 'keep-shapes', '-each', 'lx=this.innerX, ly=this.innerY', '-o', join(work, 'out.json'), 'format=geojson', 'precision=0.0001'], { stdio: 'inherit' });
if (run.status !== 0) process.exit(run.status || 1);
const merged = JSON.parse(await readFile(join(work, 'out.json'), 'utf8'));
await rm(work, { recursive: true, force: true });

// 투영: 교육청마다 가운데 위도의 cos로 경도를 줄이는 등장방형 투영(시도 크기에서는 메르카토르와 차이가 작다).
// 긴 변을 W 단위로 맞춘다. 학교 점은 app.js가 같은 식(proj)으로 옮긴다.
const W = 1000, pad = 12;
const shift = (code, [lng, lat]) => { for (const s of insets[code] || []) if (lng >= s.lng[0] && lng <= s.lng[1] && lat >= s.lat[0] && lat <= s.lat[1]) return [lng + s.dx, lat + s.dy]; return [lng, lat]; };
const rings = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
// public/geo/에는 학교 좌표(schools-<시도코드>.json, npm run fetch:geo)도 있으므로 폴더를 지우지 않고 경계 파일만 덮어쓴다.
await mkdir(out, { recursive: true });
const byOffice = new Map();
for (const f of merged.features) { const c = f.properties.office; if (!byOffice.has(c)) byOffice.set(c, []); byOffice.get(c).push(f); }
for (const [code, features] of [...byOffice].sort()) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const f of features) for (const poly of rings(f.geometry)) for (const ring of poly) for (const pt of ring) { const [x, y] = shift(code, pt); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const cos = Math.cos((minY + maxY) / 2 * Math.PI / 180), spanX = (maxX - minX) * cos, spanY = maxY - minY, k = (W - pad * 2) / Math.max(spanX, spanY);
  const proj = { lng0: minX, lat0: maxY, kx: +(k * cos).toFixed(4), ky: +k.toFixed(4), pad };
  const xy = pt => { const [lng, lat] = shift(code, pt); return [(lng - proj.lng0) * proj.kx + pad, (proj.lat0 - lat) * proj.ky + pad]; };
  const r1 = n => Math.round(n * 10) / 10;
  const path = g => rings(g).map(poly => poly.map(ring => { let last = ''; const pts = []; for (const pt of ring) { const [x, y] = xy(pt).map(r1), s = x + ',' + y; if (s !== last) pts.push(s); last = s; } return pts.length > 3 ? 'M' + pts.join('L') + 'Z' : ''; }).join('')).join('');
  const districts = features.map(f => { const [lx, ly] = xy([f.properties.lx, f.properties.ly]).map(r1); return { name: f.properties.name, d: path(f.geometry), lx, ly }; }).filter(d => d.d).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  // 점선 상자: 옮겨 그린 섬들(옮길 범위 안의 경계)의 실제 범위(옮긴 뒤)를 10단위 넓힌 범위. 지도 밖으로 나가지 않게 자른다.
  const boxes = (insets[code] || []).map(s => { const b = [Infinity, Infinity, -Infinity, -Infinity]; for (const f of features.filter(f => f.properties.name === s.name)) for (const poly of rings(f.geometry)) for (const ring of poly) for (const pt of ring) { if (pt[0] < s.lng[0] || pt[0] > s.lng[1] || pt[1] < s.lat[0] || pt[1] > s.lat[1]) continue; const [x, y] = xy(pt); b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } const W2 = Math.ceil(spanX * k + pad * 2), H2 = Math.ceil(spanY * k + pad * 2), x = Math.max(1, b[0] - 10), y = Math.max(1, b[1] - 10); return { name: s.name, x: r1(x), y: r1(y), w: r1(Math.min(W2 - 1, b[2] + 10) - x), h: r1(Math.min(H2 - 1, b[3] + 10) - y) }; });
  const file = { source: '통계청 행정동 경계(vuski/admdongkor 가공본)', version, w: Math.ceil(spanX * k + pad * 2), h: Math.ceil(spanY * k + pad * 2), proj, insets: (insets[code] || []).map(({ lng, lat, dx, dy }) => ({ lng, lat, dx, dy })), boxes, districts };
  await writeFile(new URL(code + '.json', out), JSON.stringify(file));
  console.log(`${code}: ${districts.length}개 시·군·구, ${file.w}×${file.h}, ${(JSON.stringify(file).length / 1024).toFixed(0)}KB`);
}
