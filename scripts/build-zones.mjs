// 초등학교 통학구역 만들기: 한국교육시설안전원 '초등학교통학구역' SHP(공공데이터포털 15159265, 반기 3월·9월 갱신)를
// 교육청 지도(public/geo/<교육청 코드>.json)와 같은 투영의 SVG 경로로 바꿔 public/geo/<교육청 코드>-zones.json에 저장한다.
// 학교 지도에서 지역을 고르고 '통학구역' 스위치를 켰을 때만 받는다. {source, base, zones:{시·군·구:[{n:이름, g:0 통학구역|1 공동통학구역, d:경로}]}}
// 사용: node scripts/build-zones.mjs <초등학교통학구역.shp>
//   원본: https://www.data.go.kr/data/15159265/fileData.do (압축을 풀면 .shp·.dbf·.shx·.prj·.cpg, 좌표계 EPSG:5186, 속성 EUC-KR)
//   시·군·구·읍면 경계(npm run build:geo)를 다시 만들었으면 투영이 바뀌므로 이 스크립트도 다시 실행한다. mapshaper는 npx로 받아 쓴다.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 시도 이름 → NEIS 교육청 코드(build-geo.mjs와 같은 표). 전남광주통합특별시는 자치구를 광주광역시교육청(F10), 시·군을 전라남도교육청(Q10)으로 나눈다.
const officeOf = { 서울특별시: 'B10', 부산광역시: 'C10', 대구광역시: 'D10', 인천광역시: 'E10', 광주광역시: 'F10', 대전광역시: 'G10', 울산광역시: 'H10', 세종특별자치시: 'I10', 경기도: 'J10', 강원특별자치도: 'K10', 충청북도: 'M10', 충청남도: 'N10', 전북특별자치도: 'P10', 전라남도: 'Q10', 경상북도: 'R10', 경상남도: 'S10', 제주특별자치도: 'T10' };

// 지역 코드표(public/regions.json)로 시도 코드 → 그 시도의 교육청 코드들(통합특별시는 둘).
export function officesBySido(regions) {
  const map = new Map();
  for (const [sido, region] of Object.entries(regions)) map.set(String(region.code), sido === '전남광주통합특별시' ? ['F10', 'Q10'] : officeOf[sido] ? [officeOf[sido]] : []);
  return map;
}
// 경로 문자열(M x,y L … Z M …)을 고리 목록으로 풀고, 점이 그 안에 있는지 본다(짝홀 규칙: 구멍·섬이 섞여도 맞다).
export const ringsOf = d => d.split('M').filter(Boolean).map(r => r.replace(/Z$/, '').split('L').map(p => p.split(',').map(Number)));
export function inside(rings, [x, y]) {
  let hit = false;
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
// 구역 안쪽 점이 들어 있는 시·군·구를 찾는다. 시군구 코드로 맞추지 않는 까닭: 구 개편(인천·화성 등)으로 원본의 코드·이름이
// NEIS 주소의 시·군·구와 어긋나도 지도 경계(build-geo)와는 늘 맞게 하려는 것이다. 어디에도 안 들면(경계에 걸친 구역) 이름표 자리가 가장 가까운 시·군·구.
// 돌려주는 값: {name, dist} — 안에 들면 dist 0.
export function districtAt(districts, pt) {
  let best = null, bestD = Infinity;
  for (const d of districts) {
    if (inside(d.rings, pt)) return { name: d.name, dist: 0 };
    const dist = Math.hypot(d.lx - pt[0], d.ly - pt[1]);
    if (dist < bestD) { bestD = dist; best = d.name; }
  }
  return { name: best, dist: bestD };
}
// 학구 이름에서 적용 시기 같은 덧붙은 설명을 뗀다: '고운초통학구역[2026학년도 …]' → '고운초통학구역'.
export const zoneName = raw => String(raw || '').trim().replace(/^(.*?통학구역).*$/, '$1');
// 교육청 지도 파일의 투영(proj)과 섬 옮기기(insets)로 경위도 → 지도 좌표. app.js의 mapPoint, build-geo.mjs의 xy와 같은 식.
export function projector(shape) {
  const { proj, insets = [] } = shape;
  return ([lng, lat]) => {
    for (const s of insets) if (lng >= s.lng[0] && lng <= s.lng[1] && lat >= s.lat[0] && lat <= s.lat[1]) { lng += s.dx; lat += s.dy; break; }
    return [(lng - proj.lng0) * proj.kx + proj.pad, (proj.lat0 - lat) * proj.ky + proj.pad];
  };
}
// 폴리곤 → 'M x,y L…Z'(소수 1자리). 반올림으로 같은 점이 이어지면 하나로 줄이고, 점이 셋 미만으로 남는 고리는 버린다.
export function pathOf(geometry, xy) {
  const polys = geometry?.type === 'Polygon' ? [geometry.coordinates] : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  let d = '';
  for (const poly of polys) for (const ring of poly) {
    const pts = [];
    for (const pt of ring) { const [x, y] = xy(pt), s = x.toFixed(1) + ',' + y.toFixed(1); if (pts[pts.length - 1] !== s) pts.push(s); }
    if (pts.length > 1 && pts[0] === pts[pts.length - 1]) pts.pop();
    if (pts.length >= 3) d += 'M' + pts.join('L') + 'Z';
  }
  return d;
}

async function main() {
  const src = process.argv[2];
  if (!src) { console.error('사용: node scripts/build-zones.mjs <초등학교통학구역.shp>'); process.exit(1); }
  const out = new URL('../public/geo/', import.meta.url);
  const offices = officesBySido(JSON.parse(await readFile(new URL('../public/regions.json', import.meta.url), 'utf8')));
  const work = join(tmpdir(), 'school-zones-' + process.pid);
  await mkdir(work, { recursive: true });
  // 경위도로 바꾸고 단순화한다(interval은 허용 오차 미터, 이웃 구역과 맞닿은 경계가 어긋나지 않게 한꺼번에 단순화).
  const run = spawnSync('npx', ['--yes', 'mapshaper@0.7.61', src, 'encoding=euc-kr', '-proj', 'wgs84', '-simplify', 'interval=40', 'keep-shapes', '-each', 'cx=this.innerX, cy=this.innerY', '-o', join(work, 'zones.json'), 'format=geojson', 'precision=0.00001'], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (run.status !== 0) process.exit(run.status || 1);
  const features = JSON.parse(await readFile(join(work, 'zones.json'), 'utf8')).features;
  await rm(work, { recursive: true, force: true });
  const shapes = new Map(), shapeOf = async office => {
    if (!shapes.has(office)) { const shape = JSON.parse(await readFile(new URL(office + '.json', out), 'utf8')); shapes.set(office, { xy: projector(shape), districts: shape.districts.map(d => ({ name: d.name, lx: d.lx, ly: d.ly, rings: ringsOf(d.d) })) }); }
    return shapes.get(office);
  };
  const byOffice = new Map(), unknown = new Map();
  let base = '';
  for (const f of features) {
    const p = f.properties;
    if (!f.geometry) continue;
    if (p.BASE_DT > base) base = p.BASE_DT;
    // 시도 코드의 교육청(통합특별시는 둘) 가운데 구역 안쪽 점이 드는 시·군·구, 없으면 가장 가까운 곳.
    let best = null;
    for (const office of offices.get(String(p.SD_CD)) || []) {
      const { xy, districts } = await shapeOf(office), hit = districtAt(districts, xy([p.cx, p.cy]));
      if (hit.name && (!best || hit.dist < best.dist)) best = { office, ...hit };
    }
    if (!best) { unknown.set(p.SD_CD, (unknown.get(p.SD_CD) || 0) + 1); continue; }
    if (best.dist) console.warn(`경계 밖 구역을 가장 가까운 시·군·구에 넣음: ${zoneName(p.HAKGUDO_NM)} → ${best.name}`);
    if (!byOffice.has(best.office)) byOffice.set(best.office, []);
    byOffice.get(best.office).push({ district: best.name, n: zoneName(p.HAKGUDO_NM), g: p.HAKGUDO_GB === '1' ? 1 : 0, geometry: f.geometry });
  }
  let total = 0;
  for (const [office, list] of [...byOffice].sort()) {
    const { xy } = await shapeOf(office), zones = {};
    for (const z of list) { const d = pathOf(z.geometry, xy); if (d) (zones[z.district] ??= []).push({ n: z.n, g: z.g, d }); }
    // 통학구역을 먼저, 그 위에 공동통학구역을 그리도록 정렬한다(이름순).
    for (const l of Object.values(zones)) l.sort((a, b) => a.g - b.g || a.n.localeCompare(b.n, 'ko'));
    const body = JSON.stringify({ source: '한국교육시설안전원 초등학교통학구역', base, zones: Object.fromEntries(Object.entries(zones).sort()) });
    await writeFile(new URL(office + '-zones.json', out), body);
    const n = Object.values(zones).reduce((a, l) => a + l.length, 0);
    total += n;
    console.log(`${office}: 시·군·구 ${Object.keys(zones).length}곳 · 구역 ${n}개 · ${(body.length / 1024).toFixed(0)}KB`);
  }
  console.log(`구역 ${total}개 저장(기준일 ${base}) → public/geo/<교육청>-zones.json` + (unknown.size ? ` · 교육청을 찾지 못한 시도 코드 ${[...unknown].map(([k, v]) => k + '×' + v).join(', ')}` : ''));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
