// 지형 음영 만들기: 공개 고도 타일(AWS Terrain Tiles, terrarium 형식 — SRTM 등을 Mapzen이 가공, 키 없음)을 받아
// 교육청 지도(public/geo/<교육청 코드>.json)와 같은 투영으로 음영(hillshade)을 계산하고, 시·군·구 경계 밖은 투명하게 지운
// 회색+투명도 PNG를 public/geo/<교육청 코드>-relief.png에 저장한다. 학교 지도는 이 그림을 시·군·구 색 위, 학교 점 아래에 깐다.
// 지형은 거의 바뀌지 않으므로 경계를 다시 만들었을 때(npm run build:geo)만 다시 돌리면 된다.
// 사용: node scripts/build-relief.mjs [교육청 코드…]   (생략하면 17개 모두. 받은 타일은 임시 폴더에 두고 다시 쓴다.)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';

const geo = new URL('../public/geo/', import.meta.url);
const codes = process.argv.slice(2).length ? process.argv.slice(2) : ['B10', 'C10', 'D10', 'E10', 'F10', 'G10', 'H10', 'I10', 'J10', 'K10', 'M10', 'N10', 'P10', 'Q10', 'R10', 'S10', 'T10'];
const cache = join(tmpdir(), 'school-relief-tiles');
await mkdir(cache, { recursive: true });

// --- PNG 읽기·쓰기(8비트, 인터레이스 없음). 의존성 없이 zlib만 쓴다.
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
function decodePng(buf) {
  let pos = 8, w = 0, h = 0, type = 0;const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), name = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); type = data[9]; if (data[8] !== 8 || data[12]) throw new Error('지원하지 않는 PNG'); }
    if (name === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const bpp = { 0: 1, 2: 3, 4: 2, 6: 4 }[type], raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[row + x - bpp] : 0, b = y ? out[row - stride + x] : 0, c = x >= bpp && y ? out[row - stride + x - bpp] : 0;
      out[row + x] = (raw[src + x] + [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]) & 255;
    }
  }
  return { w, h, bpp, data: out };
}
// 회색+투명도(색 형식 4) PNG. 줄마다 다섯 필터 중 절댓값 합이 가장 작은 것을 고른다.
function encodePng(w, h, data) {
  const bpp = 2, stride = w * bpp, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    const row = y * stride;let best = null, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      const line = Buffer.alloc(stride + 1);line[0] = f;let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? data[row + x - bpp] : 0, b = y ? data[row - stride + x] : 0, c = x >= bpp && y ? data[row - stride + x - bpp] : 0;
        const v = (data[row + x] - [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]) & 255;line[x + 1] = v;sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = line; }
    }
    best.copy(raw, y * (stride + 1));
  }
  const chunk = (name, body) => { const head = Buffer.alloc(8);head.writeUInt32BE(body.length, 0);head.write(name, 4, 'ascii');const tail = Buffer.alloc(4);tail.writeUInt32BE(crc(Buffer.concat([Buffer.from(name, 'ascii'), body])), 0);return Buffer.concat([head, body, tail]); };
  const ihdr = Buffer.alloc(13);ihdr.writeUInt32BE(w, 0);ihdr.writeUInt32BE(h, 4);ihdr[8] = 8;ihdr[9] = 4;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// --- 고도 타일: terrarium 형식은 고도(m) = R×256 + G + B/256 − 32768. 바다(음수)는 0으로 둔다.
const tiles = new Map();
async function tile(z, x, y) {
  const key = `${z}/${x}/${y}`;if (tiles.has(key)) return tiles.get(key);
  const file = join(cache, `${z}-${x}-${y}.png`);let buf;
  try { buf = await readFile(file); } catch {
    for (let i = 0; i < 3 && !buf; i++) { const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${key}.png`).catch(() => null); if (r?.ok) buf = Buffer.from(await r.arrayBuffer()); }
    if (!buf) throw new Error('타일을 받지 못했습니다: ' + key);
    await writeFile(file, buf);
  }
  const png = decodePng(buf), raw = new Float32Array(png.w * png.h), elev = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) { const p = i * png.bpp;raw[i] = png.data[p] * 256 + png.data[p + 1] + png.data[p + 2] / 256 - 32768; }
  // 원자료에는 내륙 한가운데 수천 m 봉우리·수백 m 구덩이 같은 오류가 섞여 있다. 3×3 중앙값과 120m 넘게 다른 칸은 중앙값으로 바꾼다.
  for (let y = 0; y < png.h; y++) for (let x = 0; x < png.w; x++) {
    const near = [];for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy;if (xx >= 0 && yy >= 0 && xx < png.w && yy < png.h) near.push(raw[yy * png.w + xx]); }
    near.sort((a, b) => a - b);const med = near[near.length >> 1], v = raw[y * png.w + x];
    elev[y * png.w + x] = Math.max(0, Math.abs(v - med) > 120 ? med : v);
  }
  tiles.set(key, elev);return elev;
}
// 웹 메르카토르 픽셀 좌표(줌 z, 타일 256px).
const merc = (lng, lat, z) => { const n = 256 * 2 ** z, s = Math.sin(lat * Math.PI / 180);return [(lng + 180) / 360 * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n]; };

// --- 시·군·구 경로(M x,y L x,y … Z)를 고리 목록으로. 가로줄마다 교차점을 세어(짝홀 규칙) 경계 안 칸을 칠한다.
const ringsOf = d => d.split('M').filter(Boolean).map(part => { const n = part.match(/-?\d+(?:\.\d+)?/g).map(Number), pts = [];for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);return pts; });
function landMask(shape, W, H, sx, sy) {
  const mask = new Uint8Array(W * H);
  for (const d of shape.districts) {
    const rings = ringsOf(d.d);
    for (let py = 0; py < H; py++) {
      const y = (py + 0.5) / sy, xs = [];
      for (const r of rings) for (let i = 0; i < r.length; i++) { const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length]; if ((y1 <= y) !== (y2 <= y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1)); }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) { const a = Math.max(0, Math.ceil(xs[i] * sx - 0.5)), b = Math.min(W - 1, Math.floor(xs[i + 1] * sx - 0.5));for (let px = a; px <= b; px++) mask[py * W + px] = 1; }
    }
  }
  return mask;
}

// 음영: 북서쪽(315°) 45° 높이의 빛. 평지 밝기(sin 45°)보다 어두운 비탈은 검정, 밝은 비탈은 흰색으로 투명도만큼 덮는다.
// 시도 전체를 한 화면에 볼 때도 산줄기가 읽히도록 고도를 EXAG배 과장하고, 투명도는 STEP 간격(16단계)으로 묶어 파일을 줄인다.
// AZ는 수학 각도(동쪽 0°, 반시계)로 바꾼 빛 방향: 360 − 315 + 90 = 135°.
const EXAG = 2.2, AZ = 135 * Math.PI / 180, ALT = 45 * Math.PI / 180, FLAT = Math.sin(ALT), SHADOW = 0.62, LIGHT = 0.42, TARGET = 60, MAXSCALE = 1.5, STEP = 16;
for (const code of codes) {
  const shape = JSON.parse(await readFile(new URL(code + '.json', geo), 'utf8')), { proj, insets = [] } = shape;
  // 출력 해상도: 지도 1단위가 몇 m인지 보고 약 60m/px(최대 지도 단위당 1.5px)로 잡는다. 타일 줌은 그보다 조금 더 촘촘하게.
  const unitM = 110540 / proj.ky, scale = Math.min(MAXSCALE, unitM / TARGET), W = Math.round(shape.w * scale), H = Math.round(shape.h * scale), sx = W / shape.w, sy = H / shape.h, resM = unitM / scale;
  const latMid = proj.lat0 - (shape.h / 2 - proj.pad) / proj.ky, z = Math.min(12, Math.ceil(Math.log2(156543.03 * Math.cos(latMid * Math.PI / 180) / resM)));
  // 출력 칸 → 경위도(옮겨 그린 섬은 원래 자리에서 고도를 읽는다).
  const lngLat = (px, py) => {
    let lng = ((px + 0.5) / sx - proj.pad) / proj.kx + proj.lng0, lat = proj.lat0 - ((py + 0.5) / sy - proj.pad) / proj.ky;
    for (const s of insets) { const ol = lng - s.dx, oa = lat - s.dy;if (ol >= s.lng[0] && ol <= s.lng[1] && oa >= s.lat[0] && oa <= s.lat[1]) { lng = ol;lat = oa;break; } }
    return [lng, lat];
  };
  const mask = landMask(shape, W, H, sx, sy);
  // 필요한 타일을 미리 받는다(경계 안 칸만, 동시에 8개).
  const need = new Set();
  for (let py = 0; py < H; py += 4) for (let px = 0; px < W; px += 4) { if (!mask[py * W + px]) continue; const [mx, my] = merc(...lngLat(px, py), z);need.add(`${Math.floor(mx / 256)}/${Math.floor(my / 256)}`); }
  const list = [...need];for (let i = 0; i < list.length; i += 8) await Promise.all(list.slice(i, i + 8).map(k => { const [x, y] = k.split('/').map(Number);return tile(z, x, y); }));
  // 고도 격자(경계 밖도 이웃 비탈 계산용으로 1칸 여유를 두고 읽는다. 받지 않은 타일 자리는 0).
  const sample = (lng, lat) => {
    const [mx, my] = merc(lng, lat, z), x0 = Math.floor(mx - 0.5), y0 = Math.floor(my - 0.5), fx = mx - 0.5 - x0, fy = my - 0.5 - y0;
    const at = (x, y) => { const t = tiles.get(`${z}/${Math.floor(x / 256)}/${Math.floor(y / 256)}`);return t ? t[(y & 255) * 256 + (x & 255)] : 0; };
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
  const elev = new Float32Array(W * H);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) { const near = mask[py * W + px] || mask[py * W + Math.max(0, px - 1)] || mask[py * W + Math.min(W - 1, px + 1)] || mask[Math.max(0, py - 1) * W + px] || mask[Math.min(H - 1, py + 1) * W + px];if (near) elev[py * W + px] = sample(...lngLat(px, py)); }
  const out = Buffer.alloc(W * H * 2);let peak = 0;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const i = py * W + px;if (!mask[i]) continue;peak = Math.max(peak, elev[i]);
    const e = (x, y) => elev[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
    const lat = lngLat(px, py)[1], dxm = resM * Math.cos(lat * Math.PI / 180) / Math.cos(latMid * Math.PI / 180), dym = resM;
    const dzdx = (e(px + 1, py) - e(px - 1, py)) / (2 * dxm) * EXAG, dzdy = (e(px, py + 1) - e(px, py - 1)) / (2 * dym) * EXAG;
    const slope = Math.atan(Math.hypot(dzdx, dzdy)), aspect = Math.atan2(dzdy, -dzdx);
    const shade = Math.sin(ALT) * Math.cos(slope) + Math.cos(ALT) * Math.sin(slope) * Math.cos(AZ - aspect), diff = shade - FLAT;
    const alpha = diff < 0 ? Math.min(1, -diff / FLAT) * SHADOW : Math.min(1, diff / (1 - FLAT)) * LIGHT;
    out[i * 2] = diff < 0 ? 0 : 255;out[i * 2 + 1] = Math.min(255, Math.round(alpha * 255 / STEP) * STEP);
  }
  const png = encodePng(W, H, out);
  await writeFile(new URL(code + '-relief.png', geo), png);
  console.log(`${code}: ${W}×${H}px, 약 ${resM.toFixed(0)}m/px, 타일 z${z} ${list.length}장, 최고 ${peak.toFixed(0)}m, ${(png.length / 1024).toFixed(0)}KB`);
}
