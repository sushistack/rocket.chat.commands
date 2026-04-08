import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { PlaneClient } from '../plane/PlaneClient';
import { DailyForgeMeta } from '../plane/types';
import { todayString } from '../ui/formatters';

export class GenerateCommand implements ISlashCommand {
    public command = 'gen';
    public i18nParamsExample = '';
    public i18nDescription = '오늘의 퀘스트를 수동 생성합니다 (W1)';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
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

            // Idempotency: check if today's quests already exist
            const existingTodayItems = await client.getTodayIssues(projectId, states);
            const alreadyGenerated = existingTodayItems.some(
                (item) => item.meta.generation_source === 'routine_copy',
            );
            if (alreadyGenerated) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setText(`ℹ️ 오늘의 퀘스트가 이미 생성되어 있어요. (${existingTodayItems.length}개)\n💡 초기화하려면 \`/regen\`을 사용하세요.`);
                await modify.getCreator().finish(msg);
                return;
            }

            // Step 1: Defer overdue
            const deferredState = states.find(
                (s) => s.name.toLowerCase().includes('deferred'),
            );
            const todoStates = states.filter((s) => s.group === 'unstarted' || s.group === 'started');
            const todoStateIds = new Set(todoStates.map((s) => s.id));

            let deferredCount = 0;
            if (deferredState) {
                const issues = await client.listIssues(projectId);
                const overdue = issues.filter((i) => {
                    if (!todoStateIds.has(i.state)) return false;
                    const st = states.find((s) => s.id === i.state);
                    if (st && st.name.toLowerCase().includes('deferred')) return false;
                    return i.target_date && i.target_date < today;
                });

                for (const issue of overdue) {
                    const meta = PlaneClient.parseMeta(issue.description_html);
                    const dc = (meta.defer_count || 0) + 1;
                    if (!meta.original_quest_date) {
                        meta.original_quest_date = meta.quest_date || issue.target_date || today;
                    }
                    meta.defer_count = dc;
                    await client.updateIssue(projectId, issue.id, {
                        state: deferredState.id,
                        description_html: PlaneClient.setMeta(issue.description_html, meta),
                    });
                    await client.createComment(projectId, issue.id,
                        `<p>⏳ [${today}] 미완료로 자동 연기됨 (연기 횟수: ${dc})</p>`);
                    deferredCount++;
                }
            }

            // Step 2: Copy routines
            const todoState = states.find(
                (s) => (s.group === 'unstarted' || s.group === 'backlog') && !s.name.toLowerCase().includes('deferred'),
            );
            let copiedCount = 0;

            if (todoState) {
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
                        const isOn = onLabel ? i.labels.includes(onLabel.id) : true;
                        return hasRoutine && isOn;
                    });

                    for (const routine of routineIssues) {
                        if (existingSourceIds.has(routine.id)) continue;
                        const meta = PlaneClient.parseMeta(routine.description_html);
                        if (meta.routine_active_from && meta.routine_active_from > today) continue;
                        if (meta.routine_active_until && meta.routine_active_until < today) continue;
                        if (meta.routine_type === 'weekly' && meta.routine_days && !meta.routine_days.includes(todayDay)) continue;

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
                            routine.description_html || `<p>${routine.name}</p>`, questMeta);

                        await client.createIssue(projectId, {
                            name: routine.name,
                            description_html: descHtml,
                            state: todoState.id,
                            priority: routine.priority,
                            target_date: today,
                        } as any);
                        copiedCount++;
                    }
                }
            }

            let text = '🔨 퀘스트 생성 완료!\n';
            if (deferredCount > 0) text += `⏳ 미완료 ${deferredCount}개 자동 연기\n`;
            text += `📋 루틴 복사: ${copiedCount}개\n`;
            text += '💡 LLM 기반 추가 태스크 생성은 추후 연동 예정';

            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setText(text);
            await modify.getCreator().finish(msg);
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setText(`❌ Plane 연결 실패: ${errMsg}`);
            await modify.getCreator().finish(msg);
        }
    }
}
