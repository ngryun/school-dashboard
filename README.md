# 학교모아 · Education Specialist

교육전문직을 위한 관내 학교 정보·학사일정 조회 웹앱입니다. 전국 17개 시도교육청을 지원하며 최초 기본값은 강원특별자치도교육청입니다.

- 공개 주소(GitHub Pages): https://ngryun.github.io/school-dashboard/

## 실행

Node.js 22 이상에서 실행합니다. 외부 npm 패키지 설치가 필요 없습니다.

```sh
cd '/Volumes/Transcend/EducationSpecialist /school-dashboard'
npm start
```

브라우저에서 http://127.0.0.1:3210 을 엽니다. 인증키가 없으면 **가상 학교와 가상 일정으로 구성한 데모**가 표시됩니다.

## 실제 NEIS 자료 연결

1. https://open.neis.go.kr/portal/myPage/actKeyPage.do?tabIdx=1 에서 인증키를 발급받습니다.
2. `.env.example` 파일을 `.env`로 복사합니다.
3. `.env`에 `NEIS_API_KEY=발급받은키`를 입력합니다.
4. 실행 중인 서버를 Ctrl+C로 종료하고 `npm start`로 다시 실행합니다.
5. 교육청을 선택해 학교를 불러온 다음 **관할 지역 버튼**을 누릅니다. **전체** 버튼으로 해당 교육청 전체를 확인할 수 있습니다.

로컬 서버와 Workers 배포에서는 인증키를 서버 환경변수로만 사용합니다. `.env`는 버전 관리에서 제외됩니다. 브라우저에는 조회 선호값(교육청·지역)만 저장합니다. GitHub Pages 정적 버전의 인증키 처리는 아래 배포 항목을 참고하세요.

## 기능

- 전국 교육청 선택, 시·군·구 버튼으로 관할 지역 선택
- 한눈에 보기 카드: 학교급 구성 도넛 차트(설립 구분 포함), 학급 수 기준 학교 규모 분포, 이번 달 일정 유형 분포(라이브러리 없는 인라인 SVG, 색각 이상 검증을 통과한 학교급 색상)
- 초등학교·중학교·고등학교·특수학교 필터
- 월별 학사일정 달력·목록, 학교명·행사명 검색, 행사 상세보기
- 학교 기본 정보, 주소, 전화, 팩스, 홈페이지, 설립일 등 상세보기
- 학교별 학급 수(목록 열·지역 합계 타일)와 상세화면의 학년별 학급 구성(계열·학과)
- 학교알리미 공시 기준 학생 수·교원 수(목록 열·지역 합계 타일), 상세화면의 학년별 학급·학생 수, 학급당·교사 1인당 학생 수, 직위별 교원 현황
- 특수학교 상세화면의 날짜별 과정·학년·학급·교시 시간표
- 현재 필터 결과를 엑셀에서 열 수 있는 UTF-8 BOM CSV로 내려받기
- 조회 진행 상황, 일부 학교 조회 실패, 빈 결과 안내
- 모바일 반응형 화면 및 키보드로 닫을 수 있는 상세창

## 데이터 출처와 조회 방식

- 학교 정보: `https://open.neis.go.kr/hub/schoolInfo`
- 학사일정: `https://open.neis.go.kr/hub/SchoolSchedule`
- 특수학교 시간표: `https://open.neis.go.kr/hub/spsTimetable`
- 학급 정보: `https://open.neis.go.kr/hub/classInfo` (학년도·학교 단위 조회, 학급 1건당 1행)

특수학교의 기본 정보도 `schoolInfo`에서 조회하며 `spsTimetable`은 수업 시간표 전용입니다. 학사일정과 시간표는 서로 다른 자료입니다.

학급 수는 지역 일정을 조회할 때 학교마다 학급 정보를 한 번씩 가져와 집계하며(학년도별로 탭 안에서 재사용), 전체 지역처럼 아직 가져오지 않은 학교는 상세화면의 **학급 정보 불러오기**로 개별 조회할 수 있습니다. 학년도는 3월을 기준으로 바뀝니다. **학생 수·교원 수는 NEIS 개방 API가 제공하지 않으므로** 학교알리미 공시정보를 중계 서버를 거쳐 받아 표시합니다. 설정 방법은 아래 **학생 수·교원 수(학교알리미 공시)** 항목을 참고하세요.

학교 목록과 일정은 페이지당 1,000건씩 끝까지 수집합니다(최대 100페이지, 초과 시 오류 표시). 학교별 일정은 동시에 최대 5개 학교씩 조회합니다. 시도 전체를 조회하면 시간이 걸릴 수 있으므로 관할 지역 버튼으로 범위를 좁힐 수 있습니다. 지역 버튼은 학교 도로명 주소의 시·군·구를 기준으로 생성하며 교육지원청의 법적 관할 구역 자동 판정 기능은 아닙니다. 데모에서는 강원 18개 시·군 버튼을 표시합니다.

자료 미등록은 행사 없음의 확정이 아닙니다. 일부 학교 조회가 실패하면 화면과 일정 CSV 파일명에 일부 결과임을 표시합니다. NEIS 오류 시 데모를 실제 조회 결과로 대체하지 않습니다.

## 학생 수·교원 수 (학교알리미 공시)

학생 수와 교원 수는 [학교알리미 Open API](https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_m0.do)(한국교육학술정보원, 공공누리 제3유형)에서 가져옵니다. 이 API는 브라우저 교차 출처 호출을 허용하지 않으므로 서버가 중계합니다. 로컬 서버(`server.mjs`)와 Cloudflare Worker(`worker.mjs`)가 `/api/alrimi/<항목>`으로 중계하며, GitHub Pages 정적 버전은 `public/config.js`의 `apiBase`(저장소 변수 `API_BASE`)에 적힌 Worker 주소를 호출합니다.

- 사용 항목: `apiType=09` 학년별·학급별 학생수(학급수·학생수·학급당 학생수·교사수·교사 1인당 학생수), `apiType=22` 직위별 교원 현황(상세화면에서 자동 조회)
- 조회 단위: 시도·시군구·학교급(`public/regions.json` 코드표, [schoolinfo-mcp](https://github.com/chrisryugj/schoolinfo-mcp) MIT 자료) 단위로 받아 학교명(공백 제거)으로 NEIS 학교와 맞춥니다. 공시 제외 학교나 명칭이 다른 분교는 표시되지 않을 수 있습니다.
- 공시 연도: 올해 자료가 없으면 작년 자료를 사용하며 화면에 연도를 표시합니다. 공시 기준일은 매년 4월 1일입니다.
- Worker는 같은 요청을 24시간 캐시합니다. 지역을 선택하면 학교급별로 한 번씩만 호출합니다.

### 설정 절차

1. **학교알리미 인증키 발급**: 위 링크에서 네이버 또는 카카오 계정으로 로그인한 뒤 API 인증키를 발급받습니다.
2. **로컬 확인**: `.env`에 `ALRIMI_API_KEY=발급받은키`를 추가하고 `npm start`로 다시 실행한 뒤 지역을 선택해 학생 수·교원 수가 표시되는지 확인합니다.
3. **Cloudflare Worker 배포**(무료 계정): 프로젝트 폴더에서 아래 명령을 차례로 실행합니다. 첫 명령은 브라우저에서 Cloudflare 로그인을 요구합니다. 배포가 끝나면 `https://school-dashboard.<계정>.workers.dev` 형태의 주소가 출력됩니다.

   ```sh
   npx wrangler login
   npm run deploy:worker
   npx wrangler secret put ALRIMI_API_KEY
   npx wrangler secret put NEIS_API_KEY
   ```

   `wrangler.toml`의 `ALLOWED_ORIGINS`에 Pages 주소(기본 https://ngryun.github.io)가 들어 있어야 브라우저 호출이 허용됩니다. Worker 주소로 접속하면 같은 앱이 서버 모드(인증키 서버 보관)로도 동작합니다.
4. **GitHub Pages 연결**: 저장소 변수 `API_BASE`에 Worker 주소를 넣고 워크플로를 다시 실행합니다.

   ```sh
   gh variable set API_BASE --repo ngryun/school-dashboard --body "https://school-dashboard.<계정>.workers.dev"
   gh workflow run deploy.yml --repo ngryun/school-dashboard
   ```

5. **확인**: 사이드바의 데이터 안내(인증키 설정) 창에 "학생·교원 수(학교알리미): 중계 서버와 인증키가 설정되어 있습니다."가 표시되면 연결된 것입니다.

## 검증

```sh
npm run check
npm test
```

페이지네이션, 조회 결과 없음, 인증 오류, 비정상 응답 및 상위 서버 오류 처리를 테스트합니다. 실제 인증키를 이용한 전체 학교 조회는 인증키 설정 후 확인이 필요합니다.

## 동작 모드

앱은 시작할 때 `api/status`를 호출해 실행 환경을 스스로 판단합니다.

| 모드 | 환경 | 인증키 위치 |
| --- | --- | --- |
| 서버 모드 | `npm start` 로컬 서버, Cloudflare Workers 배포 | 서버 환경변수 `NEIS_API_KEY` |
| 직접 조회 모드 | GitHub Pages 등 정적 호스팅 (`api/status`가 없음) | 배포 시 주입하는 공용 키(`public/config.js`), 또는 사용자가 입력한 개인 키(localStorage). 학생·교원 수는 `apiBase`의 Worker가 중계 |

직접 조회 모드에서는 브라우저가 NEIS 개방 포털을 직접 호출합니다. NEIS는 `Access-Control-Allow-Origin: *`를 반환하므로 별도 프록시 없이 동작합니다. 인증키 없이 호출하면 NEIS가 샘플 5건만 돌려주므로 실제 조회에는 인증키가 필요합니다.

## 배포

### GitHub Pages (정적)

`main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 검사·테스트를 거쳐 `public/` 폴더를 GitHub Pages에 배포합니다. 저장소 설정의 Pages 항목에서 Source가 **GitHub Actions**여야 합니다.

- 저장소 Secrets의 `NEIS_API_KEY`를 배포 워크플로가 `public/config.js`에 공용 인증키로 넣습니다. 접속하면 이 키로 바로 조회합니다. 저장소에 커밋된 `config.js`는 빈 키이며 배포 시 덮어씁니다.
- 공용 인증키는 페이지 소스에서 누구나 볼 수 있습니다. 한도가 소진되거나 키를 바꾸려면 Secret을 갱신하고 워크플로를 다시 실행하세요.

  ```sh
  gh secret set NEIS_API_KEY --repo ngryun/school-dashboard
  gh workflow run deploy.yml --repo ngryun/school-dashboard
  ```

- Secret이 없으면 접속자가 자기 인증키를 입력해야 하며 그 전까지 데모가 표시됩니다.
- 사이드바의 **인증키 설정**에서 개인 인증키를 입력하면 공용 키보다 우선 사용합니다. 개인 키는 그 브라우저의 localStorage에만 저장되고 `open.neis.go.kr`로만 전송됩니다.
- 공용 컴퓨터에서는 사용 후 **삭제** 버튼으로 인증키를 지우세요.
- 페이지가 `/school-dashboard/` 하위 경로에서 열리므로 HTML의 자원 경로는 모두 상대 경로입니다.

### Cloudflare Workers 호환 서버

`npm run build`는 `dist/server/index.js`에 웹 화면과 API 프록시를 묶습니다. NEIS 인증키는 배포 환경의 비밀 환경변수 `NEIS_API_KEY`로 설정하며 소스와 배포 산출물에 포함하지 않습니다.

접속하면 학교 정보를 먼저 불러오고, 지역 버튼을 선택하면 해당 지역의 일정을 조회합니다. 전체 지역 일정은 별도의 조회 버튼으로 시작할 수 있습니다. 조회 중에도 다른 지역을 선택할 수 있으며 이전 조회는 취소됩니다. 동일 학교·월의 일정은 탭 안에서 재사용하며 새로고침 버튼으로 갱신할 수 있습니다. 배포 서버의 공개 NEIS 응답 캐시는 10분입니다.

## 운영 범위

로컬 서버는 `127.0.0.1`에 바인딩되는 이 컴퓨터 전용 웹앱입니다. GitHub Pages 버전은 정적 파일만 제공하므로 요청 제한과 캐시가 없고, 조회량은 공용 인증키(또는 입력한 개인 인증키)의 NEIS 한도를 따릅니다. 공용 프록시 서버로 운영하려면 Workers 배포 버전에 요청 제한·캐시와 인증키 관리 방식을 적용하세요.
