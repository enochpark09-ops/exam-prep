# 시험대비 오답노트

틀린 문제 한 개를 찍으면, 그게 **어떤 개념의 결손인지** 판정하고,
그 개념의 정리 카드와 **같은 개념을 묻는 새 문제 3개**를 준다.

오답노트를 안 쓰는 이유는 쓰기 귀찮아서가 아니라, 다 쓰고 나도 실력이 오르는 느낌이
없어서다. 베껴 적기는 문제를 복제할 뿐 개념을 건드리지 않는다.
이 앱은 오답 한 건을 개념 하나의 신호로 번역하고, 그 개념만 다시 때린다.

현재 범위는 **S2 + S3** — 데이터 계층, 서버리스 함수 4개, 핵심 플로우 화면.
복습 큐(S4)와 PWA·오프라인(S5)은 아직이다.

```
촬영 → 판독·검수 → 개념 진단 → 핵심정리 카드 → 유사문제 3개 → 피드백
```

## 배포

### 가장 빠른 길 — 브라우저만으로 (로컬 설치 없음)

`npm install` 과 빌드는 Vercel 이 서버에서 알아서 한다. 컴퓨터에 Node 가 없어도 된다.

1. **GitHub** 에서 New repository → 이름 `exam-prep`, Private → Create
2. 저장소 첫 화면의 **uploading an existing file** 을 눌러, 압축 푼 폴더 **안의 내용물**을
   전부 끌어다 놓고 Commit
   (`.git` 폴더는 안 올려도 된다. 맥 Finder 에서는 원래 숨겨져 있다)
3. **vercel.com** → Add New → Project → 방금 만든 저장소 **Import**
4. Deploy 누르기 전에 **Environment Variables** 를 펼쳐서
   `ANTHROPIC_API_KEY` = `sk-ant-...` 추가
5. **Deploy**

이후로는 GitHub 에 파일을 고쳐 올릴 때마다 Vercel 이 자동으로 다시 배포한다.

키를 빼먹고 배포했다면 Project → Settings → Environment Variables 에서 넣고
Deployments 탭에서 **Redeploy** 하면 된다. 키가 없으면 앱은 뜨지만 사진을 찍는 순간
"서버 설정이 끝나지 않았습니다"가 나온다.

### 1. 로컬에서 확인

```bash
npm install
npm run build        # 타입체크 + 프로덕션 빌드
npm run smoke        # 실제 브라우저로 렌더링 확인 (API 불필요)
                     # 처음이면 npm i -D playwright && npx playwright install chromium
```

`npm run dev` 는 화면만 띄운다. `/api` 가 붙은 전체 흐름을 로컬에서 보려면
Vercel CLI가 필요하다.

```bash
npm i -g vercel
cp .env.example .env     # ANTHROPIC_API_KEY 채우기
vercel dev
```

### 2. GitHub 에 올리기

이 폴더는 이미 `git init` + 첫 커밋까지 돼 있다. 원격만 붙이면 된다.

```bash
# GitHub 에서 빈 저장소를 먼저 만든 뒤 (README 체크 해제)
git remote add origin https://github.com/<계정>/exam-prep.git
git branch -M main
git push -u origin main
```

`gh` CLI 를 쓴다면 한 줄로 끝난다.

```bash
gh repo create exam-prep --private --source=. --remote=origin --push
```

### 3. Vercel 연결

```bash
vercel link          # 프로젝트 생성 또는 기존 프로젝트에 연결
vercel env add ANTHROPIC_API_KEY production
vercel env add ANTHROPIC_API_KEY preview
vercel --prod
```

또는 vercel.com 에서 GitHub 저장소를 Import 해도 된다. 프레임워크는 자동으로
Vite 로 잡히고, 빌드·출력 설정은 `vercel.json` 에 들어 있다.

**환경변수는 Vercel 대시보드나 CLI 로만 넣는다.** `VITE_` 접두사를 붙이면
클라이언트 번들에 키가 그대로 박힌다. 빌드 전에 한 번 더 확인할 것.

### 4. 레이트리밋용 KV (선택, 권장)

없어도 돌아가지만 일일 상한이 인스턴스 메모리로 떨어져 느슨해진다.

```bash
vercel kv create exam-prep-kv    # 또는 대시보드 Storage 탭
# 연결하면 KV_REST_API_URL / KV_REST_API_TOKEN 이 자동 주입된다
```

## 구조

```
api/                        Vercel Serverless Functions
  extract.ts                  사진 → 문제 구조화 JSON
  diagnose.ts                 문제 + 오답 → 개념 id + 오답 원인
  explain.ts                  개념 → 핵심정리 카드
  generate.ts                 개념 + 원문제 → 유사문제 3개
  _lib/
    claude.ts                 API 호출, 재시도, JSON 파싱
    http.ts                   메서드·디바이스·레이트리밋 가드, 에러 → 사용자 문장
    ratelimit.ts              디바이스별 일일 상한 (KV 또는 메모리)
    prompts/                  프롬프트. 고칠 때는 v2 파일을 새로 만든다

shared/                     클라이언트와 서버가 함께 쓰는 것
  types.ts                    API 계약. 여기가 단일 출처
  checks.ts                   응답 기계 검사
  concepts.ts                 개념 사전 로딩과 진단 후보 목록
  concepts/*.json             중학 수학 개념 184개

src/
  db/schema.ts                Dexie 스키마
  db/repo.ts                  저장·조회·숙달도 갱신
  lib/api.ts                  /api 호출 래퍼, 디바이스 UUID
  lib/prefetch.ts             카드·문제 재사용 판단
  lib/flow.tsx                오답 1건 처리 동안의 화면 간 상태
  lib/image.ts                업로드 전 리사이즈 (1600px, q0.8)
  screens/                    Home, Capture, Verify, Diagnosis, Card, Quiz, Done
  components/Latex.tsx        $...$ 만 KaTeX 로 렌더, 깨져도 앱이 안 죽음
```

## 설계에서 지킨 것

**개념이 중심이다.** 오답·유사문제·풀이 이력이 전부 개념에 매달린다.
그래서 진단 프롬프트는 개념을 생성하지 못하고 **사전에서 고르기만** 한다.
그렇게 하지 않으면 "이차함수의 꼭짓점"과 "꼭짓점 구하기"가 따로 쌓인다.

**대기 시간은 학습 시간 밑에 숨긴다.** 진단 결과를 읽는 동안 카드를,
카드를 읽는 동안 유사문제를 백그라운드로 받는다. 스피너를 보는 시간이 줄어든다.

**비용이 오답 수에 비례하지 않게 한다.** 개념 카드는 개념당 하나만 만들고,
유사문제는 풀(pool)에 2개 이상 남아 있으면 재생성하지 않는다.
개념 하나를 완전히 잡는 데 Claude 호출 2~3회가 든다.

**이상한 문제는 안 내보낸다.** `generate` 응답은 기계 검사를 거친다 — LaTeX 짝,
보기 5개·중복, 정답 번호 쏠림, 풀이 단계 수, 그리고 **숫자만 바꾼 복제본**
(원문제와 자카드 유사도 0.85 초과). 걸리면 1회 재생성하고, 그래도 안 되면
통과한 문제만 내보낸다. 3개를 채우는 것보다 이상한 문제를 안 보여주는 게 낫다.

**틀린 걸 사고처럼 보여주지 않는다.** 오답은 빨강이 아니라 주황, 진동·효과음 없음.
정답 대신 "여기서 갈렸어" + 힌트를 먼저 보여주고, 풀이는 단계별로 펼친다.
지표는 "틀린 개수"가 아니라 "잡은 개념 개수"로 표시한다.

## 데이터

전부 이 기기의 IndexedDB 안에만 산다. 로그인도 서버 DB도 없다.
사진도 기기에만 남고, 판독할 때만 서버를 거쳐 Anthropic API로 가며 따로 보관하지 않는다.

다만 스키마는 처음부터 서버로 옮길 수 있게 뒀다 — 모든 레코드에 UUID·`updatedAt`·
`deletedAt`, 홈 화면의 **내보내기** 버튼으로 전체를 JSON으로 뺄 수 있다.
2단계에서 계정을 붙일 때 그 형식을 그대로 올리면 된다.

## 다음

- **S4 복습 큐** — 취약도 점수로 정렬한 하루 10문제. `db/repo.ts` 의 `dueCount`,
  `REVIEW_INTERVALS_DAYS`, `Mastery` 테이블이 이미 채워지고 있다
- **S5 PWA·오프라인·시험 모드** — Service Worker, 촬영 대기열, D-1 카드 스와이프
- **S0 육안 검증** — 별도 폴더의 검증 하네스로 실제 시험지 20~30장을 돌려
  판독 정확도와 유사문제 품질을 먼저 확인할 것. 이게 아직 안 끝났다
- 개념 사전 영어·과학 확장
