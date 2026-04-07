# /bmad 실행용 프롬프트 — DailyForge: AI 일일 퀘스트 시스템

## 프로젝트 개요

LobeHub(AI 채팅 인터페이스) + n8n(자동화 미들웨어) + Plane.so(칸반/프로젝트 관리)를 연동하여, **AI가 매일 자동으로 일일 퀘스트(루틴)를 생성·관리하고, 유저가 LobeHub 대화를 통해 태스크를 제어하는 시스템**을 구축한다.

---

## 1. 아키텍처

### 1.1 기술 스택 및 역할

| 컴포넌트 | 역할 | 배포 |
|---|---|---|
| **LobeHub** | 유저 인터페이스. 자연어 명령 입력 및 AI 대화 창구 (웹/모바일) | Self-hosted (Docker) |
| **n8n** | 미들웨어/오케스트레이터. LobeHub 명령 해석 → Plane.so API 호출, 스케줄 기반 자동화 | Self-hosted (Docker) |
| **Plane.so** | 데이터 저장소 및 칸반 보드. 프로젝트, 이슈, 사이클 관리 | Self-hosted |

### 1.2 통신 흐름

```
[LobeHub] ---(HTTP POST/Webhook)---> [n8n Webhook Node]
                                          |
                                    [n8n Workflow]
                                     /          \
                            [Plane.so API]    [LLM API (DeepSeek)]
                                     \          /
                                    [n8n Response]
                                          |
[LobeHub] <---(JSON Response)--------[n8n Webhook Response]
```

### 1.3 환경 설정

- **타임존**: `Asia/Seoul` (KST, UTC+9) — 모든 시간 기준은 이 타임존 기반
- **Plane.so API Base URL**: `{PLANE_BASE_URL}/api/v1`
- **Plane.so API Key**: 환경변수 `PLANE_API_KEY`
- **n8n Webhook Base URL**: `{N8N_BASE_URL}/webhook`
- **LLM Provider**: DeepSeek API — 환경변수 `DEEPSEEK_API_KEY`

### 1.4 LLM 설정 (DeepSeek)

| 항목 | 값 |
|---|---|
| **API Base URL** | `https://api.deepseek.com/v1` |
| **모델 (일반 태스크)** | `deepseek-chat` (DeepSeek-V3) |
| **모델 (복잡한 추론)** | `deepseek-reasoner` (DeepSeek-R1, 필요 시) |
| **API 호환성** | OpenAI SDK 호환 — n8n의 OpenAI 노드에서 Base URL만 변경하여 사용 가능 |
| **인증 헤더** | `Authorization: Bearer {DEEPSEEK_API_KEY}` |
| **응답 형식 강제** | `response_format: { "type": "json_object" }` (JSON 응답 필요 시) |

> **n8n 연동 방법**: n8n의 "OpenAI" 노드 또는 "HTTP Request" 노드 사용. OpenAI 노드 사용 시 Credentials에서 Base URL을 `https://api.deepseek.com/v1`로, API Key를 DeepSeek 키로 설정하면 그대로 호환됨.

---

## 2. Plane.so 데이터 모델

### 2.1 워크스페이스 구조

```
Workspace
├── [중장기 프로젝트 A] (예: "건강 관리") — 마일스톤 기반 관리
│   ├── 일반 이슈들 (마일스톤, 에픽 등)
│   └── 📦 일일 루틴 버킷 (Label: "daily-routine")
│       ├── 루틴 태스크 1 (매일 / 07:00 / 30분)
│       ├── 루틴 태스크 2 (월수금 / 18:00 / 60분)
│       └── ...
│
├── [중장기 프로젝트 B] (예: "개발 역량 강화") — 마일스톤 기반 관리
│   ├── 일반 이슈들
│   └── 📦 일일 루틴 버킷 (Label: "daily-routine")
│       └── ...
│
└── 🎯 [루틴 프로젝트] (특수 프로젝트, 고정 1개) — 일일 퀘스트 전용
    ├── To-Do        (State: "unstarted" 그룹)
    ├── In Progress  (State: "started" 그룹)
    ├── Deferred     (State: "unstarted" 그룹, 별도 상태)
    ├── Done         (State: "completed" 그룹)
    └── Canceled     (State: "cancelled" 그룹)
```

### 2.2 루틴 태스크 메타데이터 (Custom Properties on Plane Issue)

각 중장기 프로젝트의 "일일 루틴 버킷" 내 태스크에는 다음 커스텀 필드가 존재해야 한다:

| 필드명 | 타입 | 설명 | 예시 |
|---|---|---|---|
| `routine_type` | select | 반복 유형 | `daily`, `weekly`, `custom` |
| `routine_days` | multi-select | 실행 요일 (weekly/custom) | `["mon","wed","fri"]` |
| `routine_dates` | text (JSON) | 특정 날짜 지정 (custom) | `["2025-01-15","2025-02-01"]` |
| `routine_time` | text | 권장 시작 시간 (HH:MM, KST) | `"07:00"` |
| `routine_duration_min` | number | 기본 소요 시간 (분) | `30` |
| `routine_priority` | select | 우선순위 | `urgent`, `high`, `medium`, `low` |
| `routine_mandatory` | checkbox | 필수 여부 | `true` / `false` |
| `routine_active_from` | date | 적용 시작일 | `2025-01-01` |
| `routine_active_until` | date | 적용 종료일 (null=무기한) | `2025-12-31` |
| `routine_cooldown_days` | number | 최소 반복 간격 (일) | `0` (매일), `1` (격일) |
| `source_project_id` | text | 원본 프로젝트 ID (추적용) | `project_abc123` |
| `source_issue_id` | text | 원본 이슈 ID (추적용) | `issue_xyz789` |

> **참고**: Plane.so의 커스텀 필드 지원 여부에 따라, 위 메타데이터를 이슈 description에 JSON 블록으로 저장하는 대안을 고려한다.

### 2.3 루틴 프로젝트(일일 퀘스트) 이슈 추가 필드

| 필드명 | 타입 | 설명 |
|---|---|---|
| `quest_date` | date | 이 퀘스트가 할당된 날짜 |
| `scheduled_time` | text | LLM이 배정한 시작 시간 |
| `adjusted_duration_min` | number | LLM이 조정한 소요 시간 |
| `generation_source` | select | `routine_copy`, `llm_generated`, `user_created`, `deferred_restored` |
| `defer_count` | number | 연기된 횟수 (누적) |
| `original_quest_date` | date | 최초 할당 날짜 (연기 추적용) |

---

## 3. n8n 워크플로우 설계

### 3.1 Workflow 목록

| # | 워크플로우명 | 트리거 | 설명 |
|---|---|---|---|
| W1 | `daily-quest-generator` | Cron (매일 00:00 KST) | 일일 퀘스트 자동 생성 |
| W2 | `lobehub-command-handler` | Webhook (POST) | LobeHub 명령어 처리 |
| W3 | `daily-summary-reporter` | Cron (매일 23:00 KST) | 일일 리포트 생성 및 발송 |
| W4 | `deferred-cleanup` | Cron (매주 일요일 00:00 KST) | 장기 Deferred 태스크 정리 |

---

### 3.2 W1: daily-quest-generator (핵심 워크플로우)

**실행 시각**: 매일 00:00 KST

**처리 순서**:

#### Step 1: 어제의 미완료 태스크 연기 처리
```
1. 루틴 프로젝트에서 state="To-Do" 또는 state="In Progress"이고 due_date < 오늘인 이슈 조회
2. 각 이슈에 대해:
   a. state를 "Deferred"로 변경
   b. defer_count를 +1 증가
   c. 코멘트 추가: "⏳ [YYYY-MM-DD] 미완료로 자동 연기됨 (연기 횟수: N)"
```

#### Step 2: 루틴 기반 태스크 복사
```
1. 모든 중장기 프로젝트에서 Label="daily-routine"인 이슈 조회
2. 각 루틴 태스크에 대해 오늘 실행 조건 확인:
   a. routine_active_from <= 오늘 <= routine_active_until
   b. routine_type에 따른 요일/날짜 매칭
   c. routine_cooldown_days 충족 여부 (마지막 실행일 기준)
3. 조건 충족 시, 루틴 프로젝트에 새 이슈 생성:
   - title: 원본과 동일
   - description: 원본 복사 + 메타데이터 JSON 블록
   - state: "To-Do"
   - priority: 원본 routine_priority 매핑
   - quest_date: 오늘 날짜
   - scheduled_time: routine_time
   - adjusted_duration_min: routine_duration_min
   - generation_source: "routine_copy"
   - source_project_id, source_issue_id: 원본 참조
   - label: 원본 프로젝트명 (추적용)
   - due_date: 오늘 날짜
```

#### Step 3: LLM 기반 추가 태스크 생성 (DeepSeek-V3)
```
1. DeepSeek API에 다음 컨텍스트 전달:
   - 오늘 생성된 루틴 태스크 목록 (Step 2 결과)
   - 현재 Deferred 태스크 목록 (최근 7일)
   - 중장기 프로젝트별 마일스톤 및 진행률
   - 오늘 요일, 날짜, 공휴일 여부
   - 최근 7일간 완료율 통계
   - (선택) 캘린더 이벤트 (Google Calendar 연동 시)

2. DeepSeek API 호출:
   POST https://api.deepseek.com/v1/chat/completions
   {
     "model": "deepseek-chat",
     "response_format": { "type": "json_object" },
     "messages": [
       {
         "role": "system",
         "content": "당신은 개인 생산성 코치입니다. 반드시 JSON으로만 응답하세요."
       },
       {
         "role": "user",
         "content": "아래 컨텍스트를 기반으로:\n(a) 오늘 추가로 수행하면 좋을 태스크를 0~3개 제안하세요.\n(b) 각 태스크의 title, description, duration_min, priority, related_project를 포함한 JSON 배열로 반환하세요.\n(c) 오늘 전체 일정의 총 소요시간이 유저의 가용 시간({available_hours}시간)을 초과하지 않도록 하세요.\n(d) 최근 완료율이 낮다면 태스크 수를 줄이고, 높다면 도전적 태스크를 추가하세요.\n\n[컨텍스트]\n{context_json}"
       }
     ]
   }

3. 응답 파싱 후 이슈 생성 (generation_source: "llm_generated")
```

#### Step 4: LLM 기반 일정 최적화 (DeepSeek-V3)
```
1. 오늘의 전체 To-Do 목록을 DeepSeek API에 전달
2. DeepSeek API 호출:
   {
     "model": "deepseek-chat",
     "response_format": { "type": "json_object" },
     "messages": [
       {
         "role": "system",
         "content": "당신은 일정 최적화 전문가입니다. 반드시 JSON으로만 응답하세요."
       },
       {
         "role": "user",
         "content": "아래 태스크 목록의 시간 배분을 최적화하세요:\n(a) 각 태스크의 scheduled_time과 adjusted_duration_min을 조정하세요.\n(b) 집중력이 높은 오전에는 고난도 태스크를, 오후에는 가벼운 태스크를 배치하세요.\n(c) 태스크 간 최소 5분 휴식을 포함하세요.\n(d) 점심시간(12:00-13:00)은 비워두세요.\n(e) 각 태스크에 대해 issue_id, scheduled_time, adjusted_duration_min, reason을 포함한 JSON 배열로 반환하세요.\n\n[태스크 목록]\n{tasks_json}"
       }
     ]
   }
3. 응답에 따라 각 이슈의 scheduled_time, adjusted_duration_min 업데이트
```

#### Step 5: Deferred 태스크 복원 판단 (DeepSeek-V3)
```
1. Deferred 태스크 목록을 DeepSeek API에 전달
2. DeepSeek API 호출:
   {
     "model": "deepseek-chat",
     "response_format": { "type": "json_object" },
     "messages": [
       {
         "role": "system",
         "content": "당신은 태스크 우선순위 분석가입니다. 반드시 JSON으로만 응답하세요."
       },
       {
         "role": "user",
         "content": "연기된 태스크 중 오늘 처리 가능한 것을 선별하세요:\n(a) 오늘 남은 가용 시간: {remaining_hours}\n(b) defer_count가 3 이상이면 우선 복원 고려\n(c) routine_mandatory=true인 태스크는 가능하면 반드시 복원\n(d) 복원할 태스크의 issue_id와 reason을 포함한 JSON 배열로 반환하세요.\n\n[Deferred 태스크]\n{deferred_json}"
       }
     ]
   }
3. 복원 결정된 태스크:
   - state: "To-Do"로 변경
   - due_date: 오늘로 변경
   - generation_source: "deferred_restored"
   - 코멘트: "🔄 [YYYY-MM-DD] LLM 판단으로 Deferred에서 복원됨 (사유: ...)"
```

---

### 3.3 W2: lobehub-command-handler

**엔드포인트**: `POST {N8N_BASE_URL}/webhook/lobehub-command`

**요청 형식**:
```json
{
  "user_id": "string",
  "message": "string (슬래시 커맨드 또는 자연어)",
  "conversation_id": "string",
  "timestamp": "ISO8601"
}
```

---

#### 3.3.1 명령어 체계

모든 명령어는 슬래시(`/`) 접두사로 시작한다. 자연어 입력도 n8n에서 DeepSeek를 통해 인텐트를 분류한 뒤 해당 명령어로 매핑한다.

---

##### `/today` — 오늘의 퀘스트 목록

**설명**: 루틴 프로젝트 내 모든 버킷에서 `due_date`가 오늘인 태스크만 조회하여 버킷별로 그룹핑하여 표시한다.

**동작**:
```
1. 루틴 프로젝트의 전체 이슈 중 due_date = 오늘(YYYY-MM-DD) 필터
2. 버킷(State)별 그룹핑: To-Do, In Progress, Deferred, Done, Canceled
3. 각 태스크에 scheduled_time, adjusted_duration_min, priority 표시
4. 상단에 오늘 전체 요약 (총 태스크 수, 완료 수, 남은 시간 합계)
```

**출력 예시**:
```
📋 2026-04-07 (화) 오늘의 퀘스트

📊 전체: 8개 | ✅ Done: 2 | 🔄 진행중: 1 | 📝 대기: 4 | ⏸️ 연기: 1
⏱️ 남은 예상 시간: 3시간 20분

── 📝 To-Do ──────────────────
1. [🔴 urgent] 아침 운동 — 07:00 (30분)
2. [🟡 medium] 영어 공부 — 09:00 (45분)
3. [🟡 medium] 코드 리뷰 — 14:00 (60분)
4. [🟢 low] 독서 — 21:00 (30분)

── 🔄 In Progress ─────────────
5. [🟠 high] 프로젝트 기획서 작성 — 10:00 (90분)

── ⏸️ Deferred ────────────────
6. [🟡 medium] 블로그 포스팅 — (2회 연기)

── ✅ Done ─────────────────────
7. [🟡 medium] 명상 — 06:30 (15분) ✓
8. [🟢 low] 물 마시기 — (5분) ✓
```

---

##### `/brief` — 마일스톤 브리핑 (상위 5개)

**설명**: 모든 중장기 프로젝트(마일스톤 프로젝트)의 현재 단계, 목표 달성률, 마감일 기준 가장 가까운 마일스톤 5개를 D-Day 형식으로 요약한다.

**동작**:
```
1. 모든 중장기 프로젝트 조회 (루틴 프로젝트 제외)
2. 각 프로젝트의 활성 마일스톤(Modules/Cycles) 조회
3. 마감일(target_date) 기준 가까운 순 정렬
4. 상위 5개 마일스톤에 대해:
   a. 프로젝트명, 마일스톤명
   b. D-Day (D-N / D+N / D-Day)
   c. 이슈 기반 진행률 (완료/전체, %)
   d. 현재 단계 (진행 중인 이슈 요약)
5. DeepSeek로 전체 상황 한줄 코멘트 생성
```

**출력 예시**:
```
🎯 마일스톤 브리핑 (Top 5)

1. [건강 관리] 체지방 20% 달성
   📅 D-23 (2026-04-29) | ████████░░ 78% (7/9)
   → 현재: 주 3회 운동 루틴 진행 중

2. [개발 역량] React 포트폴리오 완성
   📅 D-45 (2026-05-21) | ███░░░░░░░ 30% (3/10)
   → 현재: 컴포넌트 설계 단계

...

💬 "건강 관리 마일스톤이 순항 중이에요! 개발 쪽은 속도를 좀 올려야 할 것 같습니다."
```

---

##### `/brief all` — 마일스톤 전체 브리핑

**설명**: `/brief`와 동일하되, 5개 제한 없이 모든 중장기 프로젝트의 전체 마일스톤을 표시한다.

**동작**:
```
1. /brief와 동일한 로직
2. 상위 5개 제한 없이 전체 마일스톤 표시
3. 프로젝트별로 그룹핑
4. 완료된 마일스톤은 접힌 상태로 하단에 표시 (최근 5개만)
5. DeepSeek로 전체 포트폴리오 수준의 분석 코멘트 생성
```

---

##### `/stats {N}` — 기간별 통계

**설명**: 최근 N일간 루틴 프로젝트의 달성률, 패턴 분석, 상세 통계를 표시한다.

**파라미터**: `N` = 일수 (기본값: 7, 허용: 1~90)

**동작**:
```
1. 루틴 프로젝트에서 최근 N일간의 모든 이슈 조회
   (quest_date 기준, 또는 due_date 기준)
2. 일별 통계 산출:
   a. 총 태스크 수, 완료 수, 취소 수, 연기 수
   b. 일별 달성률 (Done / (Done + Canceled + Deferred + 미처리))
   c. 총 투자 시간 (adjusted_duration_min 기준)
3. 기간 전체 통계:
   a. 평균 달성률
   b. 최고/최저 달성률 일자
   c. 연속 달성 스트릭 (80% 이상 기준)
   d. 가장 많이 연기된 태스크 Top 3
   e. 가장 성실히 수행한 루틴 Top 3
   f. 프로젝트(Label)별 달성률 분포
4. DeepSeek로 패턴 분석 코멘트 생성:
   - 요일별 달성률 패턴 (예: "월요일이 가장 생산적")
   - 시간대별 완료 패턴
   - 개선 제안
```

**출력 예시** (`/stats 7`):
```
📊 최근 7일 루틴 통계 (03/31 ~ 04/06)

📈 평균 달성률: 73.2%
🔥 연속 스트릭: 4일 (진행 중!)
⏱️ 총 투자 시간: 28시간 15분

── 일별 ──────────────────────
03/31 (월) ██████████ 90% (9/10)
04/01 (화) ████████░░ 80% (8/10)
04/02 (수) ██████░░░░ 60% (6/10) ← 최저
04/03 (목) ████████░░ 75% (6/8)
04/04 (금) ████████░░ 78% (7/9)
04/05 (토) ██████░░░░ 62% (5/8)
04/06 (일) ████████░░ 67% (4/6)

── 인사이트 ────────────────────
🏆 MVP 루틴: 아침 운동 (7/7 완료)
⏸️ 연기 잦은: 블로그 포스팅 (5회 연기)
📅 최적 요일: 월요일 (평균 88%)
⏰ 최적 시간: 오전 7~9시 (92% 완료율)

💬 "수요일과 주말에 집중도가 떨어지는 패턴이 보여요.
     주말 루틴을 좀 더 가볍게 조정해보는 건 어떨까요?"
```

---

##### `/regen` — 오늘 태스크 재생성

**설명**: 오늘의 태스크를 초기화하고 다시 생성한다. Done 버킷의 완료된 태스크는 보존한다.

**동작**:
```
1. 확인 프롬프트: "⚠️ Done을 제외한 오늘의 모든 태스크가 삭제 후 재생성됩니다. 진행할까요?"
2. 유저 확인 후:
   a. 루틴 프로젝트에서 due_date=오늘이고 state != "Done"인 이슈 전부 삭제
   b. W1의 Step 2~5를 다시 실행 (루틴 복사 → LLM 추가 생성 → 최적화 → Deferred 복원)
   c. 단, Done에 이미 있는 태스크와 동일한 source_issue_id를 가진 루틴은 복사하지 않음
3. 재생성 완료 후 `/today` 결과를 자동 표시
```

---

##### `/complete` — 태스크 완료 처리 (인터랙티브)

**설명**: To-Do 및 In Progress 버킷의 태스크 리스트를 번호와 함께 표시하고, 유저가 번호를 선택하여 완료 처리한다.

**동작**:
```
1. 루틴 프로젝트에서 due_date=오늘이고 state="To-Do" 또는 "In Progress"인 이슈 조회
2. 번호 매긴 리스트 표시
3. 유저 응답 대기: "완료할 퀘스트 번호를 입력하세요 (여러 개: 1,3,5 또는 범위: 1-3)"
4. 선택된 이슈:
   a. state: "Done"으로 변경
   b. completed_at 타임스탬프 기록
   c. 코멘트: "✅ [HH:MM] 유저가 수동 완료 처리"
5. 완료 후 남은 To-Do 수와 격려 메시지 표시
```

**인터랙션 예시**:
```
유저: /complete

봇: 📝 완료할 퀘스트를 선택하세요:
    1. [🔴] 아침 운동 (07:00, 30분)
    2. [🟡] 영어 공부 (09:00, 45분)
    3. [🟠] 프로젝트 기획서 (10:00, 90분) 🔄 진행중
    4. [🟢] 독서 (21:00, 30분)
    
    번호 입력 (예: 1,3 또는 1-2):

유저: 1,2

봇: ✅ 2개 퀘스트 완료!
    • 아침 운동 ✓
    • 영어 공부 ✓
    🎯 오늘 진행률: 4/8 (50%) — 절반 클리어! 계속 가봅시다!
```

---

##### `/cancel` — 태스크 취소 (인터랙티브)

**설명**: `/complete`와 동일한 인터랙션으로 To-Do 태스크를 취소(Canceled 버킷으로 이동)한다.

**동작**:
```
1. 루틴 프로젝트에서 due_date=오늘이고 state="To-Do"인 이슈 조회
2. 번호 매긴 리스트 표시
3. 유저 응답 대기: "취소할 퀘스트 번호를 입력하세요"
4. (선택) 취소 사유 입력 요청: "사유를 입력하세요 (생략 가능):"
5. 선택된 이슈:
   a. state: "Canceled"로 변경
   b. 코멘트: "❌ [HH:MM] 유저가 취소 (사유: {reason})"
6. 취소 후 남은 To-Do 수 표시
```

---

##### `/defer` — 태스크 연기 (인터랙티브)

**설명**: `/complete`, `/cancel`과 동일한 인터랙션으로 To-Do 태스크를 Deferred 버킷으로 이동한다.

**동작**:
```
1. 루틴 프로젝트에서 due_date=오늘이고 state="To-Do" 또는 "In Progress"인 이슈 조회
2. 번호 매긴 리스트 표시
3. 유저 응답 대기: "연기할 퀘스트 번호를 입력하세요"
4. 선택된 이슈:
   a. state: "Deferred"로 변경
   b. defer_count += 1
   c. 코멘트: "⏸️ [HH:MM] 유저가 수동 연기 (누적: N회)"
5. defer_count >= 3인 경우 경고: "⚠️ 이 퀘스트는 N회째 연기 중이에요. 루틴에서 제외를 고려해보세요."
```

---

##### `/restore` — Deferred 태스크 복원 (인터랙티브)

**설명**: Deferred 버킷의 태스크를 To-Do로 복원한다.

**동작**:
```
1. 루틴 프로젝트에서 state="Deferred"인 이슈 조회 (전체, 날짜 무관)
2. 번호 매긴 리스트 표시 (defer_count, original_quest_date 포함)
3. 유저 응답 대기: "복원할 퀘스트 번호를 입력하세요"
4. 선택된 이슈:
   a. state: "To-Do"로 변경
   b. due_date: 오늘로 변경
   c. 코멘트: "🔄 [HH:MM] 유저가 수동 복원 (원래 날짜: {original_quest_date})"
5. 복원 후 `/today` 갱신 안내
```

---

##### `/add {태스크명} {소요시간}` — 수동 태스크 추가

**설명**: 오늘의 To-Do에 태스크를 직접 추가한다.

**파라미터**:
- `태스크명`: 필수
- `소요시간`: 선택 (기본값: 30분, 형식: `30m`, `1h`, `1h30m`)

**동작**:
```
1. 루틴 프로젝트에 새 이슈 생성:
   - title: {태스크명}
   - state: "To-Do"
   - due_date: 오늘
   - quest_date: 오늘
   - adjusted_duration_min: {파싱된 소요시간}
   - generation_source: "user_created"
   - priority: "medium" (기본값)
2. 생성 확인 메시지 + 오늘 전체 소요시간 업데이트 표시
```

**예시**: `/add 장보기 45m` → "✅ '장보기' (45분) 추가 완료! 오늘 총 예상 시간: 5시간 35분"

---

##### `/start {태스크명|번호}` — 태스크 시작 (In Progress)

**설명**: To-Do 태스크를 In Progress 상태로 변경한다.

**동작**:
```
1. 인자가 있으면 해당 태스크를 직접 매칭
2. 인자가 없으면 To-Do 리스트를 번호와 함께 표시 → 인터랙티브 선택
3. 선택된 이슈:
   a. state: "In Progress"로 변경
   b. started_at 타임스탬프 기록
   c. 코멘트: "▶️ [HH:MM] 시작"
4. 현재 진행 중 태스크가 이미 있으면 안내: "🔄 '{기존 태스크}'도 진행 중이에요. 병행 OK?"
```

---

##### `/focus {태스크명|번호} {시간}` — 포커스 모드

**설명**: 특정 태스크에 집중 타이머를 설정한다. 타이머 종료 시 완료 여부를 확인한다.

**파라미터**:
- `태스크명|번호`: 필수
- `시간`: 선택 (기본값: 해당 태스크의 adjusted_duration_min, 형식: `25m`, `1h`)

**동작**:
```
1. 해당 태스크를 In Progress로 변경
2. 타이머 시작 메시지: "🎯 '{태스크명}' 포커스 모드 시작! ({시간}분)"
3. n8n에서 setTimeout 또는 별도 Cron으로 타이머 관리
4. 타이머 종료 시 LobeHub로 알림:
   "⏰ '{태스크명}' 시간이 끝났어요! 완료했나요? (완료 / 연장 / 연기)"
5. 유저 응답에 따라:
   - 완료 → Done 처리
   - 연장 → 추가 시간 입력 후 타이머 재시작
   - 연기 → Deferred 처리
```

---

##### `/deferred` — Deferred 태스크 목록 조회

**설명**: 현재 Deferred 버킷에 있는 모든 태스크를 표시한다.

**동작**:
```
1. 루틴 프로젝트에서 state="Deferred"인 전체 이슈 조회
2. defer_count 내림차순 정렬
3. 각 태스크에 원래 날짜, 연기 횟수, 원본 프로젝트 표시
4. 하단에 `/restore` 안내
```

---

##### `/weekly` — 주간 리포트

**설명**: 이번 주(월~일) 루틴 달성 요약 + 다음 주 프리뷰를 표시한다.

**동작**:
```
1. 이번 주 월~오늘까지의 일별 달성률
2. 프로젝트별 기여도 분포
3. 주간 MVP 루틴 / 개선 필요 루틴
4. DeepSeek로 주간 회고 코멘트 생성
5. 다음 주 예상 루틴 프리뷰 (루틴 조건 기반 미리보기)
```

---

##### `/edit {태스크명|번호}` — 태스크 수정 (추가 명령어)

**설명**: 기존 태스크의 시간, 우선순위, 제목 등을 수정한다.

**동작**:
```
1. 해당 태스크 정보 표시
2. 수정 가능 항목 안내: "무엇을 수정할까요? (시간 / 우선순위 / 제목 / 설명)"
3. 유저 입력에 따라 Plane 이슈 업데이트
```

---

##### `/swap {번호A} {번호B}` — 태스크 시간 교환 (추가 명령어)

**설명**: 두 태스크의 scheduled_time을 서로 교환한다.

**동작**:
```
1. 오늘의 To-Do 목록에서 번호A, B의 태스크 조회
2. scheduled_time 교환
3. 변경 후 일정 표시
```

**예시**: `/swap 2 4` → "🔄 '영어 공부'(09:00)와 '독서'(21:00)의 시간을 교환했어요!"

---

##### `/memo {태스크명|번호} {내용}` — 태스크에 메모 추가 (추가 명령어)

**설명**: 특정 태스크에 코멘트/메모를 남긴다.

**동작**:
```
1. 해당 이슈에 Plane 코멘트 추가: "📝 [HH:MM] {내용}"
2. 확인 메시지 표시
```

---

##### `/help` — 명령어 도움말 (추가 명령어)

**설명**: 전체 명령어 목록과 사용법을 표시한다.

---

#### 3.3.2 명령어 요약 테이블

| 명령어 | 설명 | 인터랙션 |
|---|---|---|
| `/today` | 오늘의 전체 퀘스트 (버킷별, due_date=오늘) | 조회 |
| `/brief` | 마일스톤 브리핑 (D-Day 상위 5개) | 조회 |
| `/brief all` | 마일스톤 전체 브리핑 | 조회 |
| `/stats {N}` | 최근 N일 달성 통계 | 조회 |
| `/regen` | 오늘 태스크 재생성 (Done 제외) | 확인 → 실행 |
| `/complete` | 태스크 완료 (번호 선택) | 리스트 → 번호 입력 |
| `/cancel` | 태스크 취소 (번호 선택) | 리스트 → 번호 입력 |
| `/defer` | 태스크 연기 (번호 선택) | 리스트 → 번호 입력 |
| `/restore` | Deferred → To-Do 복원 (번호 선택) | 리스트 → 번호 입력 |
| `/add {이름} {시간}` | 수동 태스크 추가 | 즉시 실행 |
| `/start {대상}` | 태스크 시작 (In Progress) | 즉시/인터랙티브 |
| `/focus {대상} {시간}` | 포커스 모드 + 타이머 | 타이머 → 결과 확인 |
| `/deferred` | Deferred 목록 조회 | 조회 |
| `/weekly` | 주간 리포트 | 조회 |
| `/edit {대상}` | 태스크 수정 | 인터랙티브 |
| `/swap {A} {B}` | 두 태스크 시간 교환 | 즉시 실행 |
| `/memo {대상} {내용}` | 태스크에 메모 추가 | 즉시 실행 |
| `/help` | 명령어 도움말 | 조회 |

---

#### 3.3.3 인텐트 분류 (자연어 → 명령어 매핑)

유저가 슬래시 명령어 대신 자연어로 입력한 경우, n8n에서 DeepSeek를 통해 인텐트를 분류한다.

```
DeepSeek API 호출:
{
  "model": "deepseek-chat",
  "response_format": { "type": "json_object" },
  "messages": [
    {
      "role": "system",
      "content": "유저의 메시지를 분석하여 아래 명령어 중 하나로 매핑하세요.\n가능한 명령어: today, brief, brief_all, stats, regen, complete, cancel, defer, restore, add, start, focus, deferred, weekly, edit, swap, memo, help, unknown\n\n반드시 다음 JSON 형식으로만 응답하세요:\n{\"command\": \"명령어\", \"args\": {\"target\": \"태스크명 또는 null\", \"params\": {}}, \"confidence\": 0.0~1.0}"
    },
    {
      "role": "user",
      "content": "{user_message}"
    }
  ]
}
```

- `confidence < 0.6`인 경우: 유저에게 의도 확인 질문
- `command = "unknown"`인 경우: 일반 대화로 처리 (LLM 자유 응답)

---

#### 3.3.4 응답 형식

```json
{
  "response_type": "text|list|progress|interactive|stats",
  "message": "string (마크다운 지원)",
  "data": { ... },
  "suggestions": ["다음 추천 행동 1", "다음 추천 행동 2"],
  "awaiting_input": false,
  "input_prompt": null
}
```

- `awaiting_input: true` + `input_prompt`: 인터랙티브 명령어에서 유저 입력을 기다리는 상태
- n8n은 `conversation_id`를 키로 대화 상태(state machine)를 관리하여, 다음 메시지가 인터랙티브 응답인지 새 명령어인지 구분

---

### 3.4 W3: daily-summary-reporter

**실행 시각**: 매일 23:00 KST

**생성 내용**:
```
1. 오늘의 성과:
   - 완료: N개 / 전체: M개 (달성률: X%)
   - 총 투자 시간: H시간 M분
2. 미완료 태스크: (있으면 목록)
3. 내일 프리뷰: (내일 예상 루틴 간략 목록)
4. DeepSeek 코멘트: 격려/피드백 메시지 (완료율 기반 톤 조절)
```

**전달 방식**: LobeHub 채팅 또는 n8n → 알림 채널 (Slack, Discord, Email 등 선택)

---

### 3.5 W4: deferred-cleanup

**실행 시각**: 매주 일요일 00:00 KST

**정책**:
```
1. defer_count >= 7인 태스크:
   - DeepSeek에게 "이 태스크를 자동 취소할지, 유지할지" 판단 요청
   - routine_mandatory=true이면 유지, 아니면 취소 권고
2. 자동 취소 결정 시:
   - state: "Canceled"
   - 코멘트: "🗑️ 7회 이상 연기로 자동 취소됨. 필요시 /restore로 복원 가능"
3. 주간 Deferred 리포트 생성 → 유저에게 발송
```

---

## 4. LobeHub 플러그인/에이전트 설정

### 4.1 시스템 프롬프트 (LobeHub Agent)

```markdown
당신은 "DailyForge" — 유저의 일일 퀘스트 관리 AI 비서입니다.

## 역할
- 유저의 자연어 명령을 해석하여 n8n 웹훅으로 전달합니다.
- 결과를 친근하고 게이미피케이션 요소를 가미하여 전달합니다.
- 유저의 생산성을 격려하되, 과도한 압박은 주지 않습니다.

## 톤 & 스타일
- 게임 퀘스트 느낌: "🎯 퀘스트 완료!", "⚔️ 오늘의 도전 과제", "🏆 연속 달성!", "🔨 오늘의 퀘스트가 Forge되었습니다!"
- 간결하고 명확하게, 불필요한 설명 최소화
- 유저가 지친 것 같으면 "오늘은 이만하면 충분해요 💪" 같은 배려 메시지

## 인터랙티브 명령어 처리
- /complete, /cancel, /defer, /restore 등 인터랙티브 명령어 실행 시:
  1. 먼저 번호가 매겨진 리스트를 표시
  2. 유저가 번호를 입력할 때까지 대기
  3. 여러 개 선택 가능: 쉼표(1,3,5) 또는 범위(1-3)
  4. 처리 결과와 남은 현황을 함께 표시

## 도구 호출
- 모든 명령은 n8n 웹훅 (`{N8N_WEBHOOK_URL}/lobehub-command`)으로 POST 요청
- 응답을 파싱하여 유저에게 보기 좋게 전달

## 가이드라인
- 태스크 이름이 모호하면 유저에게 확인 (유사 태스크 목록 제시)
- 존재하지 않는 태스크에 대한 명령은 "해당 퀘스트를 찾을 수 없어요"로 안내
- 매일 첫 대화 시 자동으로 /today 호출하여 오늘 퀘스트 표시
- /regen 실행 전에는 반드시 유저 확인을 받을 것
```

### 4.2 LobeHub 플러그인 (Function Call 정의)

```json
{
  "name": "quest_command",
  "description": "DailyForge 일일 퀘스트 관리 명령을 n8n에 전달",
  "parameters": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": [
          "today", "brief", "brief_all", "stats", "regen",
          "complete", "cancel", "defer", "restore",
          "add", "start", "focus", "deferred", "weekly",
          "edit", "swap", "memo", "help"
        ]
      },
      "target": {
        "type": "string",
        "description": "태스크 이름, 번호, 또는 ID (조회 계열은 생략)"
      },
      "params": {
        "type": "object",
        "description": "추가 파라미터",
        "properties": {
          "days": { "type": "number", "description": "/stats의 기간(일)" },
          "duration": { "type": "string", "description": "소요시간 (30m, 1h 등)" },
          "memo_content": { "type": "string", "description": "/memo의 내용" },
          "swap_target": { "type": "string", "description": "/swap의 두번째 대상" },
          "selected_numbers": { 
            "type": "string", 
            "description": "인터랙티브 선택 번호 (예: '1,3,5' 또는 '1-3')" 
          },
          "cancel_reason": { "type": "string", "description": "/cancel의 사유" }
        }
      }
    },
    "required": ["action"]
  }
}
```

---

## 5. 에러 핸들링 & 예외 처리

| 상황 | 처리 방식 |
|---|---|
| Plane.so API 응답 실패 (5xx) | n8n에서 3회 재시도 (5초 간격) → 실패 시 유저에게 "시스템 점검 중" 안내 |
| Plane.so API 인증 실패 (401) | 관리자 알림 발송, 유저에게 "잠시 후 다시 시도" 안내 |
| DeepSeek API 실패 | Step 3, 4, 5를 스킵하고 루틴 기반 태스크만 생성 (degraded mode) |
| DeepSeek API Rate Limit (429) | 지수 백오프 재시도 (1s → 2s → 4s), 3회 실패 시 degraded mode |
| DeepSeek JSON 파싱 실패 | 재시도 1회 (temperature 낮춤), 실패 시 해당 Step 스킵 |
| 태스크 이름 모호 (2개 이상 매칭) | 매칭 후보 목록을 유저에게 제시하여 선택 유도 |
| 중복 생성 방지 | quest_date + source_issue_id 조합으로 중복 체크 |
| n8n Webhook 타임아웃 (30초) | LobeHub에 "처리 중입니다..." 안내 후 비동기 결과 전달 |
| 인터랙티브 세션 타임아웃 | 5분간 유저 응답 없으면 세션 자동 종료, 안내 메시지 |

---

## 6. 게이미피케이션 요소 (선택 기능)

| 기능 | 설명 |
|---|---|
| 🔥 **연속 달성 스트릭** | N일 연속 80% 이상 완료 시 스트릭 카운트 |
| 🏆 **주간 업적** | "이번 주 30개 퀘스트 클리어!" 등 |
| 📊 **레벨 시스템** | 누적 완료 수에 따른 레벨업 (Plane 커스텀 필드로 저장) |
| 💬 **LLM 코칭 메시지** | 완료율, 스트릭, 패턴 기반 맞춤 격려/조언 |
| ⏰ **포커스 타이머** | `/focus` 명령어 — 타이머 완료 시 자동 done 확인 |
| 📅 **주간 MVP** | `/weekly`에서 가장 성실히 수행한 루틴 하이라이트 |

---

## 7. 구현 우선순위 (Phase별)

### Phase 1 — MVP (2~3주)
- [ ] Plane.so 워크스페이스 및 프로젝트 구조 세팅
- [ ] n8n W1 (daily-quest-generator) — Step 1, 2만 (LLM 없이 루틴 복사)
- [ ] n8n W2 (lobehub-command-handler) — `/today`, `/complete`, `/cancel`, `/defer` 기본 명령어
- [ ] LobeHub 에이전트 기본 설정 및 웹훅 연동
- [ ] DeepSeek API 연동 테스트 (n8n OpenAI 노드 Base URL 변경)

### Phase 2 — AI 강화 (2주)
- [ ] W1에 Step 3, 4, 5 추가 (DeepSeek 기반 태스크 생성/최적화/복원)
- [ ] W2에 자연어 인텐트 분류 추가 (DeepSeek)
- [ ] `/brief`, `/stats`, `/regen`, `/restore` 명령어 구현
- [ ] W3 (daily-summary-reporter) 구현

### Phase 3 — 고도화 (2주)
- [ ] `/focus`, `/edit`, `/swap`, `/memo` 명령어 구현
- [ ] 게이미피케이션 요소 추가
- [ ] W4 (deferred-cleanup) 구현
- [ ] `/weekly`, `/brief all` 구현
- [ ] Google Calendar 연동 (일정 충돌 방지)
- [ ] 모바일 알림 최적화

---

## 8. 설정 파라미터 (환경변수)

```env
# Plane.so
PLANE_BASE_URL=https://plane.your-domain.com
PLANE_API_KEY=plane_api_xxxxxx
PLANE_WORKSPACE_SLUG=my-workspace
DAILY_QUEST_PROJECT_ID=project_xxxxx

# n8n
N8N_BASE_URL=https://n8n.your-domain.com
N8N_WEBHOOK_SECRET=webhook_secret_xxxxx

# DeepSeek LLM
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL_CHAT=deepseek-chat
DEEPSEEK_MODEL_REASONER=deepseek-reasoner
DEEPSEEK_MAX_TOKENS=4096
DEEPSEEK_TEMPERATURE=0.3

# 유저 설정
USER_TIMEZONE=Asia/Seoul
USER_AVAILABLE_HOURS=10          # 하루 가용 시간 (시간)
USER_WAKE_TIME=07:00             # 기상 시간
USER_SLEEP_TIME=23:00            # 취침 시간
USER_LUNCH_START=12:00           # 점심 시작
USER_LUNCH_END=13:00             # 점심 종료

# 정책
DEFERRED_MAX_COUNT=7             # 자동 취소 기준 연기 횟수
DAILY_QUEST_GENERATION_TIME=00:00  # 일일 퀘스트 생성 시각
DAILY_SUMMARY_TIME=23:00         # 일일 리포트 시각
INTERACTIVE_SESSION_TIMEOUT=300  # 인터랙티브 세션 타임아웃 (초)
```

---

## 9. 추가 고려사항

1. **보안**: n8n 웹훅에 API Key 또는 HMAC 서명 검증 적용. LobeHub → n8n 통신은 HTTPS 필수.
2. **백업**: Plane.so 데이터 정기 백업 (일일 DB dump 또는 API 기반 export).
3. **멀티유저**: 현재 스펙은 단일 유저 기준. 멀티유저 확장 시 user_id 기반 격리 필요.
4. **오프라인 대응**: n8n 또는 Plane.so 다운 시 LobeHub에서 로컬 캐시로 임시 기록 후 복구 시 동기화.
5. **모니터링**: n8n Execution 로그 + 주요 에러에 대한 알림 (Slack/Discord 웹훅).
6. **DeepSeek 특이사항**:
   - `response_format: { "type": "json_object" }` 사용 시 system prompt에 "JSON으로 응답하라"는 지시가 반드시 포함되어야 함
   - DeepSeek-V3는 Function Calling을 지원하나, JSON mode가 더 안정적이므로 n8n에서는 JSON mode 사용 권장
   - Rate limit: Free tier 기준 분당 요청 제한 있음. 프로덕션에서는 유료 플랜 권장
   - DeepSeek-R1 (reasoner)은 복잡한 판단(예: Deferred 복원 판단, 주간 패턴 분석)에 선택적으로 사용. 일반 태스크에는 deepseek-chat 사용