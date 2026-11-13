import {test} from 'node:test';
import assert from 'node:assert/strict';
import {officesBySido, zoneName, projector, pathOf, ringsOf, inside, districtAt} from './build-zones.mjs';

test('학구 이름에서 적용 시기 설명을 떼고 통합특별시는 두 교육청으로 나눈다',()=>{
 assert.equal(zoneName('거진초통학구역'),'거진초통학구역');
 assert.equal(zoneName('고운초통학구역[2026학년도 1학년 신입생] 으뜸초통학구역[5~6학년]'),'고운초통학구역');
 assert.equal(zoneName('순창초유등초공동(일방)통학구역(그 외: 25.3.1~27.2.28)'),'순창초유등초공동(일방)통학구역');
 assert.equal(zoneName('외서초등학교송광분교장'),'외서초등학교송광분교장');
 const offices=officesBySido({강원특별자치도:{code:'51',sgg:{}},전남광주통합특별시:{code:'12',sgg:{}},없는시도:{code:'99',sgg:{}}});
 assert.deepEqual(offices.get('51'),['K10']);assert.deepEqual(offices.get('12'),['F10','Q10']);assert.deepEqual(offices.get('99'),[]);
});

test('경위도를 교육청 지도 좌표로 옮기고(섬 옮기기 포함) 반올림으로 겹친 점을 줄인 경로를 만든다',()=>{
 const xy=projector({proj:{lng0:127,lat0:38,kx:100,ky:200,pad:12},insets:[{lng:[130,132],lat:[37,38],dx:-1,dy:-0.5}]});
 assert.deepEqual(xy([127.5,37.5]),[62,112]);
 assert.deepEqual(xy([131,37.5]),[312,212]);// 섬: 경도 −1, 위도 −0.5만큼 옮긴 뒤 투영
 const square=[[127,38],[127.0001,38],[127.1,38],[127.1,37.9],[127,37.9],[127,38]];
 assert.equal(pathOf({type:'Polygon',coordinates:[square]},xy),'M12.0,12.0L22.0,12.0L22.0,32.0L12.0,32.0Z');
 // 점이 셋 미만으로 줄어든 고리와 도형이 없는 구역은 버린다.
 assert.equal(pathOf({type:'Polygon',coordinates:[[[127,38],[127.0001,38],[127,38]]]},xy),'');
 assert.equal(pathOf(null,xy),'');
 assert.equal(pathOf({type:'MultiPolygon',coordinates:[[square],[square]]},xy).split('M').length-1,2);
});

test('구역 안쪽 점이 드는 시·군·구를 찾고, 어디에도 안 들면 가장 가까운 곳을 고른다',()=>{
 const districts=[{name:'가군',lx:5,ly:5,rings:ringsOf('M0,0L10,0L10,10L0,10ZM4,4L6,4L6,6L4,6Z')},{name:'나시',lx:25,ly:5,rings:ringsOf('M20,0L30,0L30,10L20,10Z')}];
 assert.equal(inside(districts[0].rings,[2,2]),true);
 assert.equal(inside(districts[0].rings,[5,5]),false);// 구멍 안
 assert.deepEqual(districtAt(districts,[22,3]),{name:'나시',dist:0});
 const near=districtAt(districts,[16,5]);assert.equal(near.name,'나시');assert.equal(near.dist,9);
});
