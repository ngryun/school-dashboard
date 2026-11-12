import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAgeCsv, alignDistricts, AGE_MAX } from './fetch-population.mjs';

const head = ['행정구역', '2025년12월_계_총인구수', '2025년12월_계_연령구간인구수', ...Array.from({ length: AGE_MAX + 1 }, (_, a) => `2025년12월_계_${a}세`), '2025년12월_남_총인구수', '2025년12월_남_0세'];
const row = (name, first) => [name, '9,999', '99', ...Array.from({ length: AGE_MAX + 1 }, (_, a) => (first + a).toLocaleString('en-US')), '1', '1'];
const csv = rows => [head, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\r\n');
const ages = first => Array.from({ length: AGE_MAX + 1 }, (_, a) => first + a);

test('연령별 인구 CSV에서 시·군·구 행만 골라 0~7세를 읽는다', () => {
  const rows = parseAgeCsv(csv([
    row('경기도  (4100000000)', 5000),
    row('경기도 수원시 (4111000000)', 1200),
    row('경기도 수원시 장안구 (4111100000)', 300),
    row('경기도 화성시동탄출장소 (4159400000)', 0),
    row('북부출장소  (4110500000)', 0),
    row('세종특별자치시  (3600000000)', 400),
    row('세종특별자치시  (3611000000)', 400),
    row('전남광주통합특별시 광산구 (1233000000)', 700),
    row('전남광주통합특별시 목포시 (1211000000)', 200),
    row('인천광역시 서구 검단동(2826068000)', 50),
  ]));
  assert.deepEqual(rows.map(r => [r.sido, r.district, r.town, r.level]), [
    ['경기도', '수원시', '', 'district'],
    ['세종특별자치시', '세종시', '', 'district'],
    ['광주광역시', '광산구', '', 'district'],
    ['전라남도', '목포시', '', 'district'],
    ['인천광역시', '서구', '검단동', 'town'],
  ]);
  assert.deepEqual(rows[0].ages, ages(1200));
});

test('연령 열이 없으면 자료 형식 오류로 멈춘다', () => {
  assert.throws(() => parseAgeCsv('"행정구역","2025년12월_계_총인구수"\r\n"서울특별시 종로구 (1111000000)","1"'), /연령 열/);
});

test('새로 생긴 구는 기준 시점의 읍·면·동 인구를 다시 묶어 채운다', async () => {
  const d = (district, first) => ({ sido: '인천광역시', district, town: '', level: 'district', ages: ages(first) });
  const t = (district, town, first) => ({ sido: '인천광역시', district, town, level: 'town', ages: ages(first) });
  const base = [d('연수구', 100), d('중구', 60), d('동구', 30)];
  const current = [d('연수구', 110), d('제물포구', 0), d('영종구', 0)];
  let asked = 0;
  const { out, report } = await alignDistricts(base, current, async () => {
    asked++;
    return {
      base: [t('중구', '신포동', 10), t('중구', '운서동', 50), t('동구', '송림3.5동', 30), t('연수구', '송도1동', 100)],
      current: [t('제물포구', '신포동', 0), t('제물포구', '송림3·5동', 0), t('영종구', '운서1동', 0), t('영종구', '운서2동', 0), t('연수구', '송도1동', 0)],
    };
  });
  assert.equal(asked, 1);
  assert.deepEqual(out.get('인천광역시|연수구'), ages(100)); // 그대로인 구는 기준 시점 값
  assert.deepEqual(out.get('인천광역시|제물포구'), ages(10).map((v, i) => v + ages(30)[i])); // 신포동 + 송림3.5동(구두점만 다름)
  assert.deepEqual(out.get('인천광역시|영종구'), ages(50)); // 운서동 → 운서1동·운서2동(같은 구)
  assert.equal(out.has('인천광역시|중구'), false);
  assert.deepEqual(report.regrouped, ['인천광역시|제물포구', '인천광역시|영종구']);
  assert.equal(report.lost, 0);
});

test('행정구역이 그대로면 읍·면·동 자료를 받지 않는다', async () => {
  const rows = [{ sido: '강원특별자치도', district: '춘천시', town: '', level: 'district', ages: ages(1) }];
  const { out, report } = await alignDistricts(rows, rows, async () => { throw new Error('부르면 안 된다'); });
  assert.equal(out.size, 1);
  assert.deepEqual(report.regrouped, []);
});

test('새 구 둘에 걸친 동은 넣지 않고 빠진 인구로 알린다', async () => {
  const d = (district, first) => ({ sido: '가상시', district, town: '', level: 'district', ages: ages(first) });
  const t = (district, town, first) => ({ sido: '가상시', district, town, level: 'town', ages: ages(first) });
  const { out, report } = await alignDistricts([d('옛구', 10)], [d('새구', 0), d('다른구', 0)], async () => ({
    base: [t('옛구', '중앙동', 10)],
    current: [t('새구', '중앙1동', 0), t('다른구', '중앙2동', 0)],
  }));
  assert.deepEqual(out.get('가상시|새구'), ages(0).map(() => 0));
  assert.deepEqual(report.ambiguous, ['가상시 옛구 중앙동']);
  assert.equal(report.lost, ages(10).reduce((a, b) => a + b, 0));
});
