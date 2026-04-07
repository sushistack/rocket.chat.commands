import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IJobContext, IProcessor } from '@rocket.chat/apps-engine/definition/scheduler';
import { getPlaneClient, getRoutineProjectId } from '../commands/_helpers';
import { PlaneClient } from '../plane/PlaneClient';
import { PlaneIssue, PlaneState } from '../plane/types';
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

            // Idempotency: skip if routine_copy quests already exist for today
            const todayItems = await client.getTodayIssues(projectId, states);
            const alreadyGenerated = todayItems.some(
                (item) => item.meta.generation_source === 'routine_copy',
            );

            // Step 1: 어제의 미완료 태스크 연기 처리 (always run)
            await this.deferOverdueIssues(client, projectId, states, today);

            // Step 2: 루틴 기반 태스크 복사 (skip if already done)
            if (!alreadyGenerated) {
                await this.copyRoutineTasks(client, projectId, states, today);
            }

            // Step 3~5: LLM 기반 → n8n에서 처리 (스킵)
        } catch (error) {
            // Scheduler errors are logged by the engine
        }
    }

    private async deferOverdueIssues(
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
            // Skip already-deferred issues
            const st = states.find((s) => s.id === i.state);
            if (st && st.name.toLowerCase().includes('deferred')) return false;
            // Check if target_date is before today
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

    private async copyRoutineTasks(
        client: PlaneClient,
        projectId: string,
        states: PlaneState[],
        today: string,
    ): Promise<void> {
        const todoState = states.find(
            (s) => (s.group === 'unstarted' || s.group === 'backlog') && !s.name.toLowerCase().includes('deferred'),
        );
        if (!todoState) return;

        // Get all projects and find routine tasks (label="daily-routine")
        const projects = await client.listProjects();

        // Get today's existing issues to avoid duplicates
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
            if (project.id === projectId) continue; // Skip routine project itself

            const labels = await client.listLabels(project.id);
            const routineLabel = labels.find((l) => l.name.toLowerCase() === 'daily-routine');
            if (!routineLabel) continue;

            const issues = await client.listIssues(project.id);
            const routineIssues = issues.filter((i) => i.labels.includes(routineLabel.id));

            for (const routine of routineIssues) {
                // Skip if already copied today
                if (existingSourceIds.has(routine.id)) continue;

                const meta = PlaneClient.parseMeta(routine.description_html);

                // Check active period
                if (meta.routine_active_from && meta.routine_active_from > today) continue;
                if (meta.routine_active_until && meta.routine_active_until < today) continue;

                // Check day matching
                if (meta.routine_type === 'weekly' && meta.routine_days && !meta.routine_days.includes(todayDay)) continue;

                // Create quest issue in routine project
                const questMeta = {
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
}
