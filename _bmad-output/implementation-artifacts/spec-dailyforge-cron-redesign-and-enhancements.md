---
title: 'DailyForge Cron Redesign, Rate Limiting, and UI Enhancement'
type: 'feature'
created: '2026-04-08'
status: 'done'
baseline_commit: '99a54ee'
context:
  - docs/start.spec.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** DailyQuestGenerator(W1)가 루틴 on/off를 관리하지 않고, 크론 실행 순서가 보장되지 않으며, `/gen`·`/regen` 시 routine_mandatory 등 메타데이터가 소실된다. Plane API rate limit(60req/min) 핸들링이 없어 다수 이슈 처리 시 429 에러 발생 가능. Cycle/Module 달성도 추적 부재. 메시지가 plain text라 가독성이 낮다.

**Approach:** (A) DailyQuestGenerator를 5단계 순차 파이프라인으로 재설계하고 루틴 on/off + 메타데이터 보존 수정. (B) PlaneClient에 429 재시도 + 요청 간 딜레이 추가. (C) 달성도 크론 스텝 추가. (D) 주요 커맨드 응답을 UIKit 블록으로 전환.

## Boundaries & Constraints

**Always:**
- 크론 5단계는 반드시 순차 실행 (Step 1→5)
- 루틴 복사 시 소스 루틴의 모든 routine_* 메타 필드 보존
- Rate limit: 429 응답 시 `Retry-After` 또는 `X-RateLimit-Reset` 헤더 기반 대기 후 재시도 (최대 3회)
- UIKit 블록은 Rocket.Chat Apps Engine의 BlockBuilder API 사용
- 기존 한국어 메시지 톤 유지

**Ask First:**
- Cycle/Module 달성도의 분모 기준 (전체 이슈 수 vs 예상 이슈 수)
- UIKit 전환 대상 커맨드 우선순위

**Never:**
- 외부 라이브러리 추가 (rate limit용 등)
- 기존 커맨드 시그니처 변경
- DailySummaryReporter, DeferredCleanup 크론 시간 변경

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Routine within active period, has `off` label | `routine_active_from <= today <= routine_active_until`, has `daily-routine` + `off` labels | Remove `off`, add `on` label | Log error, skip routine |
| Routine outside active period, has `on` label | `today > routine_active_until`, has `daily-routine` + `on` labels | Remove `on`, add `off` label | Log error, skip routine |
| Routine with no active period set | `routine_active_from` and `routine_active_until` both undefined | Skip — no on/off change needed | N/A |
| Copy filter | `daily-routine` + `on` labels present | Copy to routine project as today's quest | N/A |
| Copy filter (off) | `daily-routine` + `off` labels present | Skip — do not copy | N/A |
| API 429 on first attempt | HTTP 429 with Retry-After: 5 | Wait 5s, retry, succeed | After 3 retries, throw with descriptive message |
| Metadata preservation on /gen | Routine has `routine_mandatory: true` | Copied quest retains `routine_mandatory: true` in meta | N/A |
| Deferred 3+ days auto-cancel | Issue deferred, `quest_date` 3+ days ago | Move to cancelled state | Skip if `routine_mandatory: true` |

</frozen-after-approval>

## Code Map

- `src/schedulers/DailyQuestGenerator.ts` -- 5-step pipeline rewrite (W1+W5 merge)
- `src/plane/PlaneClient.ts` -- Rate limit retry logic in private HTTP methods; add `addLabelToIssue`/`removeLabelFromIssue` methods for on/off toggle
- `src/plane/types.ts` -- No changes needed (DailyForgeMeta already has all fields)
- `src/commands/GenerateCommand.ts` -- Fix metadata copy to spread all routine_* fields
- `src/handlers/ActionHandler.ts` -- Fix handleRegen metadata copy
- `src/ui/blocks.ts` -- Add UIKit section/context/divider block builders
- `src/ui/formatters.ts` -- Add helpers for UIKit text formatting
- `src/schedulers/DeferredCleanup.ts` -- Change threshold from 7 deferrals to 3 days elapsed
- `DailyForgeApp.ts` -- No scheduler registration changes needed

## Tasks & Acceptance

**Execution:**
- [x] `src/plane/PlaneClient.ts` -- Add rate limit handling: wrap `get/post/patch/del` with retry logic on 429 status, respect `Retry-After` header, max 3 retries with exponential backoff. Add `addLabelToIssue(projectId, issueId, labelId)` and `removeLabelFromIssue(projectId, issueId, labelId)` methods for on/off label toggle.
- [x] `src/schedulers/DailyQuestGenerator.ts` -- Rewrite as 5-step sequential pipeline: Step 1 (scan `daily-routine` issues across projects, check `routine_active_from/until` vs today, swap `on`↔`off` label accordingly), Step 2 (defer overdue issues), Step 3 (copy `daily-routine` + `on` labeled routine tasks with full metadata), Step 4 (cancel issues deferred 3+ days, respect routine_mandatory), Step 5 (cycle/module progress placeholder).
- [x] `src/commands/GenerateCommand.ts` -- Fix questMeta construction: spread source routine metadata (`...meta`) before overriding quest-specific fields to preserve routine_mandatory, routine_type, routine_days, etc.
- [x] `src/handlers/ActionHandler.ts` -- Same metadata spread fix in handleRegen's questMeta construction.
- [x] `src/schedulers/DeferredCleanup.ts` -- Update threshold from `defer_count >= 7` to elapsed days check: `quest_date` 3+ days ago. Keep weekly schedule.
- [x] `src/ui/blocks.ts` -- Add `buildTodaySummaryBlocks()`, `buildIssueListBlocks()`, `buildBriefBlocks()` using UIKit Section, Context, Divider blocks.
- [x] `src/commands/TodayCommand.ts` -- Convert output from plain text to UIKit blocks via new block builders.

**Acceptance Criteria:**
- Given a routine with `daily-routine` + `on` labels and `routine_active_until: '2026-04-01'`, when the 00:00 cron runs on 2026-04-08, then `on` label is removed and `off` label is added.
- Given a routine with `daily-routine` + `off` labels and `routine_active_from: '2026-04-08'`, when the 00:00 cron runs on 2026-04-08, then `off` label is removed and `on` label is added.
- Given a routine with `daily-routine` + `off` labels, when Step 3 runs, then the routine is NOT copied to today's quests.
- Given PlaneAPI returns 429 with `Retry-After: 2`, when any API call is made, then the client waits 2s and retries successfully.
- Given `/gen` copies a routine with `routine_mandatory: true`, when the quest is later deferred 3+ days, then DeferredCleanup skips cancellation.
- Given 00:00 cron runs, then steps execute in order: on/off → defer → copy → cancel → progress.
- Given `/today` is executed, then response uses UIKit Section and Context blocks instead of plain text.

## Design Notes

**Routine on/off mechanism:** 각 프로젝트의 루틴 템플릿 이슈에는 `daily-routine` 라벨(루틴 식별용, 항상 유지)과 `on`/`off` 라벨(활성 상태)이 붙어있다. Step 1에서 `routine_active_from/until` 기반으로 `on`↔`off` 라벨을 전환. Step 3에서는 `daily-routine` + `on` 둘 다 있는 이슈만 복사 대상으로 필터링.

**Rate limit strategy:**
```typescript
// In PlaneClient private methods
if (response.statusCode === 429) {
    const retryAfter = parseInt(response.headers['retry-after'] || '2', 10);
    await sleep(retryAfter * 1000);
    return this.retry(method, path, data, attempt + 1);
}
```

**Metadata spread pattern (fix for #4):**
```typescript
const questMeta: DailyForgeMeta = {
    ...meta,                              // preserve routine_* fields
    quest_date: today,
    scheduled_time: meta.routine_time,
    adjusted_duration_min: meta.routine_duration_min || 30,
    generation_source: 'routine_copy' as const,
    defer_count: 0,
    source_project_id: project.id,
    source_issue_id: routine.id,
};
```

**DeferredCleanup threshold change:** 현재 `defer_count >= 7`에서 날짜 기반으로 변경. `quest_date`와 today 차이가 3일 이상이면 자동 취소. 이렇게 하면 매일 defer되는 것뿐 아니라 방치된 이슈도 정리됨.

## Verification

**Commands:**
- `npm run build` -- expected: TypeScript compilation succeeds with no errors
- `npm test` -- expected: All existing and new tests pass

**Manual checks:**
- 크론 실행 후 Plane.so에서 루틴 이슈의 라벨 변경 확인
- `/gen` 실행 후 생성된 퀘스트의 메타데이터에 routine_mandatory 등 포함 확인
- 429 시뮬레이션 후 재시도 동작 확인

## Spec Change Log

## Suggested Review Order

**크론 파이프라인 (핵심 로직)**

- 5단계 순차 파이프라인 엔트리포인트 — 전체 흐름 파악
  [`DailyQuestGenerator.ts:24`](../../src/schedulers/DailyQuestGenerator.ts#L24)

- Step 1: routine_active_from/until 기반 on↔off 라벨 자동 전환
  [`DailyQuestGenerator.ts:40`](../../src/schedulers/DailyQuestGenerator.ts#L40)

- Step 3: daily-routine + on 필터링, ...meta 스프레드로 메타 보존
  [`DailyQuestGenerator.ts:130`](../../src/schedulers/DailyQuestGenerator.ts#L130)

- Step 4: 3일 경과 deferred 자동 취소, NaN guard 포함
  [`DailyQuestGenerator.ts:218`](../../src/schedulers/DailyQuestGenerator.ts#L218)

**Rate Limit (인프라)**

- Retry-After / X-RateLimit-Reset 파싱, 1~60초 clamp
  [`PlaneClient.ts:45`](../../src/plane/PlaneClient.ts#L45)

- GET 메서드 429 재시도 루프 (POST/PATCH/DEL 동일 패턴)
  [`PlaneClient.ts:63`](../../src/plane/PlaneClient.ts#L63)

- 라벨 추가/제거 헬퍼 (on/off 토글용)
  [`PlaneClient.ts:161`](../../src/plane/PlaneClient.ts#L161)

**메타데이터 버그 수정**

- GenerateCommand: ...meta 스프레드 + on 라벨 필터
  [`GenerateCommand.ts:100`](../../src/commands/GenerateCommand.ts#L100)

- ActionHandler handleRegen: 동일 수정
  [`ActionHandler.ts:225`](../../src/handlers/ActionHandler.ts#L225)

**DeferredCleanup 기준 변경**

- defer_count → 날짜 기반 3일 경과로 전환
  [`DeferredCleanup.ts:38`](../../src/schedulers/DeferredCleanup.ts#L38)

**UIKit 블록**

- buildTodaySummaryBlocks: Section/Context/Divider 블록 구성
  [`blocks.ts:51`](../../src/ui/blocks.ts#L51)

- TodayCommand: 블록 빌더 호출로 전환
  [`TodayCommand.ts:28`](../../src/commands/TodayCommand.ts#L28)

**지원 파일**

- progressBar clamp 추가
  [`formatters.ts:39`](../../src/ui/formatters.ts#L39)

- 테스트: details/code 메타 형식에 맞게 업데이트
  [`PlaneClient.test.ts:15`](../../tests/PlaneClient.test.ts#L15)
