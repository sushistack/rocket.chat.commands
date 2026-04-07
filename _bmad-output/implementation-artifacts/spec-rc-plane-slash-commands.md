---
title: 'Rocket.Chat Slash Commands for Plane.so Integration'
type: 'feature'
created: '2026-04-07'
status: 'done'
baseline_commit: 'NO_VCS'
context:
  - docs/start.spec.md
  - docs/plane-openapi.yaml
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Plane.so에서 일일 퀘스트(루틴 태스크)를 관리하고 있지만, 매번 Plane UI에 접속해야 조회/상태변경이 가능하다. Rocket.Chat에서 바로 슬래시 커맨드로 제어하고 싶다.

**Approach:** Rocket.Chat Apps-Engine (TypeScript)으로 앱을 만들어, 18개 슬래시 커맨드를 통해 Plane.so REST API를 직접 호출한다. 인터랙티브 커맨드는 UIKit 버튼으로 구현한다. n8n/LLM 없이 순수 API 연동만 수행한다.

## Boundaries & Constraints

**Always:**
- Plane API 호출 시 환경변수(PLANE_API_KEY, PLANE_BASE_URL, PLANE_WORKSPACE_SLUG)로 설정 관리
- RC App Settings로 Plane 연결 설정을 노출 (설치 후 RC Admin에서 설정 가능)
- 인터랙티브 커맨드(/complete, /cancel, /defer, /restore, /start, /edit)는 UIKit 버튼 UI 사용
- 한국어 메시지 출력 (이모지 포함, start.spec.md 출력 예시 참고)
- 커맨드별 에러 시 사용자 친화적 메시지 ("Plane 연결 실패" 등)
- Plane API 응답의 cursor 기반 페이지네이션 처리

**Ask First:**
- Plane.so 커스텀 필드 미지원 시 description JSON 블록 대안 전환
- RC 앱 내 퍼시스턴스(state 캐싱) 도입 여부

**Never:**
- LLM/AI 호출 (DeepSeek 등) — 모든 LLM 의존 기능은 placeholder 메시지로 대체
- n8n 미들웨어 의존
- 자연어 인텐트 분류
- 타이머/스케줄링 기능 (/focus 타이머, /regen 자동 재생성)

</frozen-after-approval>

## Code Map

- `app.json` -- RC 앱 매니페스트 (id, name, version, requiredApiVersion)
- `DailyForgeApp.ts` -- 메인 App 클래스. IUIKitInteractionHandler 구현, 커맨드 등록
- `src/commands/` -- 각 슬래시 커맨드 ISlashCommand 구현체 (파일당 1커맨드)
- `src/plane/PlaneClient.ts` -- Plane.so REST API 클라이언트 (IHttp 래퍼)
- `src/plane/types.ts` -- Plane API 응답 타입 정의
- `src/ui/blocks.ts` -- UIKit BlockBuilder 헬퍼 (버튼 리스트, 요약 카드 등)
- `src/ui/formatters.ts` -- 메시지 포맷터 (이모지, 프로그레스바, 통계 렌더링)
- `src/handlers/ActionHandler.ts` -- UIKit 버튼 클릭 이벤트 핸들러
- `src/settings.ts` -- RC App Settings 정의 (Plane URL, API Key, Workspace Slug)
- `.env.example` -- 환경변수 예시 (기존 파일, 오타 수정)

## Tasks & Acceptance

**Execution:**
- [x] `app.json`, `tsconfig.json`, `package.json` -- RC Apps 프로젝트 스캐폴딩 -- apps-engine 의존성 설정
- [x] `.env.example` -- LANE_BASE_URL → PLANE_BASE_URL 오타 수정 (유저가 이미 수정함)
- [x] `src/settings.ts` -- RC App Settings 정의 (PLANE_BASE_URL, PLANE_API_KEY, PLANE_WORKSPACE_SLUG, ROUTINE_PROJECT_ID)
- [x] `src/plane/types.ts` -- Plane API 타입 정의 (Project, Issue, State, Label, Cycle, Comment, PaginatedResponse)
- [x] `src/plane/PlaneClient.ts` -- Plane REST API 클라이언트 구현 (프로젝트/이슈/상태/라벨/사이클/코멘트 CRUD, 페이지네이션)
- [x] `src/ui/formatters.ts` -- 메시지 포맷 헬퍼 (프로그레스바, 우선순위 이모지, 시간 포맷, 통계 테이블)
- [x] `src/ui/blocks.ts` -- UIKit 블록 헬퍼 (이슈 리스트 버튼, 확인 다이얼로그)
- [x] `src/commands/TodayCommand.ts` -- /today: 오늘 퀘스트 목록 (due_date=오늘, state별 그룹핑)
- [x] `src/commands/BriefCommand.ts` -- /brief [all]: 마일스톤 브리핑 (사이클 기반, D-Day, 진행률)
- [x] `src/commands/StatsCommand.ts` -- /stats {N}: 기간별 통계 (달성률, 스트릭, Top3, LLM 코멘트는 placeholder)
- [x] `src/commands/CompleteCommand.ts` -- /complete: UIKit 버튼으로 태스크 완료 처리
- [x] `src/commands/CancelCommand.ts` -- /cancel: UIKit 버튼으로 태스크 취소
- [x] `src/commands/DeferCommand.ts` -- /defer: UIKit 버튼으로 태스크 연기 (defer_count 증가)
- [x] `src/commands/RestoreCommand.ts` -- /restore: Deferred → To-Do 복원 (UIKit 버튼)
- [x] `src/commands/AddCommand.ts` -- /add {name} {duration}: 수동 태스크 추가
- [x] `src/commands/StartCommand.ts` -- /start: 태스크 In Progress 전환 (UIKit 버튼 또는 인자)
- [x] `src/commands/FocusCommand.ts` -- /focus: 타이머 미구현 stub, In Progress 전환만 수행
- [x] `src/commands/DeferredCommand.ts` -- /deferred: Deferred 목록 조회
- [x] `src/commands/WeeklyCommand.ts` -- /weekly: 주간 통계 (LLM 코멘트는 placeholder)
- [x] `src/commands/EditCommand.ts` -- /edit: UIKit 모달로 태스크 수정 (제목, 우선순위, 시간)
- [x] `src/commands/SwapCommand.ts` -- /swap {A} {B}: 두 태스크 시간 교환
- [x] `src/commands/MemoCommand.ts` -- /memo {target} {content}: 태스크에 코멘트 추가
- [x] `src/commands/RegenCommand.ts` -- /regen: LLM 미구현 stub (Done 제외 삭제 후 "LLM 미연동" 안내)
- [x] `src/commands/HelpCommand.ts` -- /help: 전체 명령어 도움말
- [x] `DailyForgeApp.ts` -- 메인 App 클래스, 모든 커맨드 등록 + UIKit 액션 핸들러
- [x] `src/handlers/ActionHandler.ts` -- UIKit 블록 액션 핸들러 (버튼 클릭 → Plane API 호출 → 결과 메시지)

**Acceptance Criteria:**
- Given RC에 앱 배포됨, when /today 실행, then Plane 루틴 프로젝트의 오늘 이슈가 state별 그룹핑되어 표시됨
- Given 오늘 To-Do 이슈 존재, when /complete 실행, then 버튼 UI로 이슈 목록 표시되고 버튼 클릭 시 Done 상태로 변경됨
- Given Plane 연결 실패, when 아무 커맨드 실행, then "Plane 연결 실패" 에러 메시지 표시됨
- Given /brief 실행, when 사이클(마일스톤) 존재, then D-Day 및 진행률과 함께 상위 5개 표시됨
- Given /add 운동 45m 실행, when 정상, then Plane에 새 이슈 생성되고 확인 메시지 표시됨

## Design Notes

**Plane 이슈 메타데이터 전략:** Plane.so 커스텀 필드가 API로 지원되지 않을 경우, description 하단에 `<!-- DAILYFORGE_META: {...} -->` JSON 블록을 삽입하여 quest_date, generation_source, defer_count 등을 저장한다. PlaneClient에서 파싱/업데이트 로직을 캡슐화한다.

**UIKit 인터랙션 패턴:** 인터랙티브 커맨드는 (1) 커맨드 실행 → 이슈 목록 + 버튼 메시지 전송, (2) 버튼 클릭 → ActionHandler에서 blockActionId 파싱 → Plane API 호출 → 결과 메시지 업데이트. blockActionId 형식: `{action}_{issueId}` (예: `complete_abc123`).

**State 매핑:** Plane state는 프로젝트별 커스텀이므로, 앱 초기화 시 state 목록을 조회하여 group(unstarted/started/completed/cancelled) 기반으로 매핑한다. "Deferred"는 unstarted 그룹 내 별도 state로 가정.

## Verification

**Commands:**
- `rc-apps deploy --url {RC_URL} --username {admin} --password {pass}` -- expected: 앱 배포 성공
- RC 채팅방에서 `/today` 입력 -- expected: Plane 이슈 목록 메시지 표시
- `/help` 입력 -- expected: 전체 커맨드 도움말 표시

**Manual checks:**
- /complete 실행 후 버튼 클릭 → Plane UI에서 해당 이슈 state 변경 확인
- /add 실행 후 Plane UI에서 새 이슈 생성 확인

## Spec Change Log

- **Review round 1**: Fixed 14 issues found by blind/edge-case/acceptance reviewers. Key fixes: KST date consistency in PlaneClient, settings validation, pagination guard, CancelCommand excluding Deferred, RegenCommand with UIKit confirm + delete logic, defer warning message matching spec.

## Suggested Review Order

**Core Architecture**

- Entry point: App class wires all 18 commands + UIKit handlers
  [`DailyForgeApp.ts:48`](../../DailyForgeApp.ts#L48)

- Plane API client with pagination, meta embedding, KST date helper
  [`PlaneClient.ts:16`](../../src/plane/PlaneClient.ts#L16)

- Shared types define Plane entities + DailyForge metadata shape
  [`types.ts:1`](../../src/plane/types.ts#L1)

- Settings validation throws early on unconfigured values
  [`_helpers.ts:5`](../../src/commands/_helpers.ts#L5)

**UIKit Interaction Flow**

- ActionHandler dispatches button clicks to complete/cancel/defer/restore/start/edit/regen
  [`ActionHandler.ts:21`](../../src/handlers/ActionHandler.ts#L21)

- BlockBuilder helpers create per-issue buttons with unique blockIds
  [`blocks.ts:4`](../../src/ui/blocks.ts#L4)

- Edit modal submit handler in app class parses view state, updates issue
  [`DailyForgeApp.ts:112`](../../DailyForgeApp.ts#L112)

**Key Commands**

- /today: fetches today's issues, groups by state, renders summary header
  [`TodayCommand.ts:18`](../../src/commands/TodayCommand.ts#L18)

- /complete: shows UIKit buttons, delegates to ActionHandler on click
  [`CompleteCommand.ts:11`](../../src/commands/CompleteCommand.ts#L11)

- /brief: aggregates cycles across all projects, shows D-Day + progress
  [`BriefCommand.ts:12`](../../src/commands/BriefCommand.ts#L12)

- /add: parses name+duration args, creates issue with embedded meta
  [`AddCommand.ts:16`](../../src/commands/AddCommand.ts#L16)

- /regen: UIKit confirm dialog → deletes non-Done issues (LLM stub)
  [`RegenCommand.ts:11`](../../src/commands/RegenCommand.ts#L11)

**Supporting**

- Message formatters: KST dates, progress bars, priority emoji, duration parsing
  [`formatters.ts:1`](../../src/ui/formatters.ts#L1)

- RC App settings definition for Plane connection
  [`settings.ts:1`](../../src/settings.ts#L1)

- App manifest and project config
  [`app.json`](../../app.json)
