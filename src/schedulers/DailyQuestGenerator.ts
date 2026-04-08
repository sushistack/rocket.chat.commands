import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IJobContext, IProcessor } from '@rocket.chat/apps-engine/definition/scheduler';
import { getPlaneClient, getRoutineProjectId } from '../commands/_helpers';
import { PlaneClient } from '../plane/PlaneClient';
import { DailyForgeMeta, PlaneIssue, PlaneState } from '../plane/types';
import { todayString } from '../ui/formatters';

export class DailyQuestGenerator implements IProcessor {
    public id = 'daily-quest-generator';

    public async processor(
        jobContext: IJobContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        try {
            const client = await getPlaneClient(read, http);
            const projectId = await getRoutineProjectId(read);
            const today = todayString();
            const states = await client.listStates(projectId);

            // 5-step sequential pipeline
            await this.step1RoutineOnOff(client, today);
            await this.step2DeferOverdue(client, projectId, states, today);
            await this.step3CopyRoutines(client, projectId, states, today);
            await this.step4CancelStaleDeferred(client, projectId, states, today);
            // Step 5: Cycle/Module progress — placeholder
        } catch (error) {
            // Scheduler errors are logged by the engine
        }
    }

    /**
     * Step 1: 루틴 on/off 자동 관리
     * routine_active_from/until 기간 체크해서 on↔off 라벨 전환
     */
    private async step1RoutineOnOff(client: PlaneClient, today: string): Promise<void> {
        const projects = await client.listProjects();

        for (const project of projects) {
            const labels = await client.listLabels(project.id);
            const routineLabel = labels.find((l) => l.name.toLowerCase() === 'daily-routine');
            if (!routineLabel) continue;

            const onLabel = labels.find((l) => l.name.toLowerCase() === 'on');
            const offLabel = labels.find((l) => l.name.toLowerCase() === 'off');
            if (!onLabel || !offLabel) continue;

            const issues = await client.listIssues(project.id);
            const routineIssues = issues.filter((i) => i.labels.includes(routineLabel.id));

            for (const issue of routineIssues) {
                const meta = PlaneClient.parseMeta(issue.description_html);
                // Skip if no active period defined
                if (!meta.routine_active_from && !meta.routine_active_until) continue;

                const isWithinPeriod =
                    (!meta.routine_active_from || meta.routine_active_from <= today) &&
                    (!meta.routine_active_until || meta.routine_active_until >= today);
                const hasOn = issue.labels.includes(onLabel.id);
                const hasOff = issue.labels.includes(offLabel.id);

                try {
                    if (isWithinPeriod && hasOff) {
                        // 기간 내인데 off → on으로 전환
                        await client.removeLabelFromIssue(project.id, issue.id, offLabel.id);
                        await client.addLabelToIssue(project.id, issue.id, onLabel.id);
                    } else if (!isWithinPeriod && hasOn) {
                        // 기간 밖인데 on → off로 전환
                        await client.removeLabelFromIssue(project.id, issue.id, onLabel.id);
                        await client.addLabelToIssue(project.id, issue.id, offLabel.id);
                    }
                } catch {
                    // Log error, skip this routine
                }
            }
        }
    }

    /**
     * Step 2: 어제의 미완료 태스크 → Deferred 처리
     */
    private async step2DeferOverdue(
        client: PlaneClient,
        projectId: string,
        states: PlaneState[],
        today: string,
    ): Promise<void> {
        const deferredState = states.find(
            (s) => s.name.toLowerCase().includes('deferred'),
        );
        if (!deferredState) return;

        const todoStates = states.filter((s) => s.group === 'unstarted' || s.group === 'started');
        const todoStateIds = new Set(todoStates.map((s) => s.id));

        const issues = await client.listIssues(projectId);
        const overdue = issues.filter((i) => {
            if (!todoStateIds.has(i.state)) return false;
            const st = states.find((s) => s.id === i.state);
            if (st && st.name.toLowerCase().includes('deferred')) return false;
            return i.target_date && i.target_date < today;
        });

        for (const issue of overdue) {
            const meta = PlaneClient.parseMeta(issue.description_html);
            const deferCount = (meta.defer_count || 0) + 1;
            if (!meta.original_quest_date) {
                meta.original_quest_date = meta.quest_date || issue.target_date || today;
            }
            meta.defer_count = deferCount;

            const updatedDesc = PlaneClient.setMeta(issue.description_html, meta);
            await client.updateIssue(projectId, issue.id, {
                state: deferredState.id,
                description_html: updatedDesc,
            });
            await client.createComment(
                projectId,
                issue.id,
                `<p>⏳ [${today}] 미완료로 자동 연기됨 (연기 횟수: ${deferCount})</p>`,
            );
        }
    }

    /**
     * Step 3: on + daily-routine 라벨 루틴 기반 오늘 퀘스트 복사
     * 메타데이터 전체 보존 (...meta spread)
     */
    private async step3CopyRoutines(
        client: PlaneClient,
        projectId: string,
        states: PlaneState[],
        today: string,
    ): Promise<void> {
        // Idempotency check
        const todayItems = await client.getTodayIssues(projectId, states);
        const alreadyGenerated = todayItems.some(
            (item) => item.meta.generation_source === 'routine_copy',
        );
        if (alreadyGenerated) return;

        const todoState = states.find(
            (s) => (s.group === 'unstarted' || s.group === 'backlog') && !s.name.toLowerCase().includes('deferred'),
        );
        if (!todoState) return;

        const projects = await client.listProjects();
        const existingIssues = await client.listIssues(projectId);
        const existingSourceIds = new Set(
            existingIssues
                .map((i) => PlaneClient.parseMeta(i.description_html).source_issue_id)
                .filter(Boolean),
        );

        const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        const todayDate = new Date(today + 'T00:00:00+09:00');
        const todayDay = dayNames[todayDate.getDay()];

        for (const project of projects) {
            if (project.id === projectId) continue;

            const labels = await client.listLabels(project.id);
            const routineLabel = labels.find((l) => l.name.toLowerCase() === 'daily-routine');
            if (!routineLabel) continue;
            const onLabel = labels.find((l) => l.name.toLowerCase() === 'on');

            const issues = await client.listIssues(project.id);
            const routineIssues = issues.filter((i) => {
                const hasRoutine = i.labels.includes(routineLabel.id);
                // on 라벨이 있는 프로젝트에서는 on 필터 적용, 없으면 기존 동작 유지
                const isOn = onLabel ? i.labels.includes(onLabel.id) : true;
                return hasRoutine && isOn;
            });

            for (const routine of routineIssues) {
                if (existingSourceIds.has(routine.id)) continue;

                const meta = PlaneClient.parseMeta(routine.description_html);
                if (meta.routine_active_from && meta.routine_active_from > today) continue;
                if (meta.routine_active_until && meta.routine_active_until < today) continue;
                if (meta.routine_type === 'weekly' && meta.routine_days && !meta.routine_days.includes(todayDay)) continue;

                // Preserve all routine metadata via spread
                const questMeta: DailyForgeMeta = {
                    ...meta,
                    quest_date: today,
                    scheduled_time: meta.routine_time,
                    adjusted_duration_min: meta.routine_duration_min || 30,
                    generation_source: 'routine_copy' as const,
                    defer_count: 0,
                    source_project_id: project.id,
                    source_issue_id: routine.id,
                };

                const descHtml = PlaneClient.setMeta(
                    routine.description_html || `<p>${routine.name}</p>`,
                    questMeta,
                );

                await client.createIssue(projectId, {
                    name: routine.name,
                    description_html: descHtml,
                    state: todoState.id,
                    priority: routine.priority,
                    target_date: today,
                } as any);
            }
        }
    }

    /**
     * Step 4: Deferred 이슈 중 3일 경과 → Canceled 처리
     * routine_mandatory === true인 경우 스킵
     */
    private async step4CancelStaleDeferred(
        client: PlaneClient,
        projectId: string,
        states: PlaneState[],
        today: string,
    ): Promise<void> {
        const cancelledState = states.find((s) => s.group === 'cancelled');
        if (!cancelledState) return;

        const stateMap = new Map(states.map((s) => [s.id, s]));
        const issues = await client.listIssues(projectId);
        const deferredIssues = issues.filter((i) => {
            const state = stateMap.get(i.state);
            return state && state.name.toLowerCase().includes('deferred');
        });

        const todayMs = new Date(today + 'T00:00:00+09:00').getTime();

        for (const issue of deferredIssues) {
            const meta = PlaneClient.parseMeta(issue.description_html);
            if (meta.routine_mandatory === true) continue;

            const questDate = meta.quest_date || issue.target_date;
            if (!questDate) continue;

            const questMs = new Date(questDate + 'T00:00:00+09:00').getTime();
            if (isNaN(questMs)) continue;
            const elapsedDays = Math.floor((todayMs - questMs) / (1000 * 60 * 60 * 24));

            if (elapsedDays >= 3) {
                await client.updateIssue(projectId, issue.id, {
                    state: cancelledState.id,
                });
                await client.createComment(
                    projectId,
                    issue.id,
                    `<p>🗑️ [${today}] ${elapsedDays}일 경과로 자동 취소됨. 필요시 /restore로 복원 가능</p>`,
                );
            }
        }
    }
}
