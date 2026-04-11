import {
    IHttp,
    IModify,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { getPlaneClient, getRoutineProjectId } from '../commands/_helpers';
import { PlaneClient } from '../plane/PlaneClient';
import { PulsarMeta } from '../plane/types';
import { nowTimeString, todayString } from '../ui/formatters';

export class ActionHandler {
    constructor(
        private readonly app: any,
        private readonly read: IRead,
        private readonly http: IHttp,
        private readonly modify: IModify,
    ) {}

    async handleAction(actionId: string, userId: string, roomId: string, triggerId?: string): Promise<void> {
        const underscoreIdx = actionId.indexOf('_');
        if (underscoreIdx === -1) return;

        const action = actionId.substring(0, underscoreIdx);
        const issueId = actionId.substring(underscoreIdx + 1);

        try {
            switch (action) {
                case 'complete':
                    await this.handleComplete(issueId, roomId);
                    break;
                case 'cancel':
                    await this.handleCancel(issueId, roomId);
                    break;
                case 'defer':
                    await this.handleDefer(issueId, roomId);
                    break;
                case 'restore':
                    await this.handleRestore(issueId, roomId);
                    break;
                case 'start':
                    await this.handleStart(issueId, roomId);
                    break;
                case 'regen':
                    await this.handleRegen(issueId, roomId);
                    break;
                case 'delete':
                    await this.handleDelete(issueId, roomId);
                    break;
                default:
                    break;
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            await this.sendMessage(roomId, `❌ Plane 연결 실패: ${errMsg}`, '#e74c3c');
        }
    }

    private async handleComplete(issueId: string, roomId: string): Promise<void> {
        const client = await getPlaneClient(this.read, this.http);
        const projectId = await getRoutineProjectId(this.read);
        const time = nowTimeString();

        const completedState = await client.findStateByGroup(projectId, 'completed');
        if (!completedState) {
            await this.sendMessage(roomId, '⚠️ completed 상태를 찾을 수 없어요.');
            return;
        }

        const issue = await client.getIssue(projectId, issueId);
        await client.updateIssue(projectId, issueId, { state: completedState.id });
        await client.createComment(projectId, issueId, `<p>✅ [${time}] 유저가 수동 완료 처리</p>`);

        // Count remaining actionable issues
        const states = await client.listStates(projectId);
        const { items: todayItems } = await client.getTodayIssues(projectId, states);
        const remaining = todayItems.filter(
            (item) => item.state.group === 'unstarted' || item.state.group === 'started',
        ).length;

        await this.sendAttachment(roomId, {
            color: '#2ecc71',
            text: `✅ "${issue.name}" 완료! 🎉`,
            fields: [
                { title: '📋 전체 퀘스트', value: `${todayItems.length}개`, short: true },
                { title: '📝 남은 퀘스트', value: `${remaining}개`, short: true },
            ],
        });
    }

    private async handleCancel(issueId: string, roomId: string): Promise<void> {
        const client = await getPlaneClient(this.read, this.http);
        const projectId = await getRoutineProjectId(this.read);
        const time = nowTimeString();

        const cancelledState = await client.findStateByGroup(projectId, 'cancelled');
        if (!cancelledState) {
            await this.sendMessage(roomId, '⚠️ cancelled 상태를 찾을 수 없어요.');
            return;
        }

        const issue = await client.getIssue(projectId, issueId);
        await client.updateIssue(projectId, issueId, { state: cancelledState.id });
        await client.createComment(projectId, issueId, `<p>❌ [${time}] 유저가 취소</p>`);

        await this.sendMessage(roomId, `❌ "${issue.name}" 퀘스트를 취소했어요.`, '#e74c3c');
    }

    private async handleDefer(issueId: string, roomId: string): Promise<void> {
        const client = await getPlaneClient(this.read, this.http);
        const projectId = await getRoutineProjectId(this.read);
        const time = nowTimeString();

        const states = await client.listStates(projectId);
        const deferredState = states.find((s) => s.name.toLowerCase().includes('deferred'));
        if (!deferredState) {
            await this.sendMessage(roomId, '⚠️ Deferred 상태를 찾을 수 없어요.');
            return;
        }

        const issue = await client.getIssue(projectId, issueId);
        const meta = PlaneClient.parseMeta(issue.description_html);

        const deferCount = (meta.defer_count || 0) + 1;
        if (!meta.original_quest_date) {
            meta.original_quest_date = meta.quest_date || issue.target_date || todayString();
        }
        meta.defer_count = deferCount;

        const updatedDescription = PlaneClient.setMeta(issue.description_html, meta);
        await client.updateIssue(projectId, issueId, {
            state: deferredState.id,
            description_html: updatedDescription,
        });

        let commentText = `<p>⏸️ [${time}] 유저가 수동 연기 (누적: ${deferCount}회)</p>`;
        if (deferCount >= 3) {
            commentText += `<p>⚠️ 이 퀘스트가 ${deferCount}회 연기되었습니다. 우선순위를 재검토해주세요!</p>`;
        }
        await client.createComment(projectId, issueId, commentText);

        const fields = [
            { title: '🔄 누적 연기', value: `${deferCount}회`, short: true },
        ];
        if (deferCount >= 3) {
            fields.push({ title: '⚠️ 경고', value: '루틴 제외를 고려해보세요', short: true });
        }
        await this.sendAttachment(roomId, {
            color: '#9b59b6',
            text: `⏸️ "${issue.name}" 연기`,
            fields,
        });
    }

    private async handleRestore(issueId: string, roomId: string): Promise<void> {
        const client = await getPlaneClient(this.read, this.http);
        const projectId = await getRoutineProjectId(this.read);
        const time = nowTimeString();
        const today = todayString();

        const states = await client.listStates(projectId);
        const restoreState = states.find(
            (s) => (s.group === 'unstarted' || s.group === 'backlog') && !s.name.toLowerCase().includes('deferred'),
        );
        if (!restoreState) {
            await this.sendMessage(roomId, '⚠️ 복원할 unstarted 상태를 찾을 수 없어요.');
            return;
        }

        const issue = await client.getIssue(projectId, issueId);
        await client.updateIssue(projectId, issueId, {
            state: restoreState.id,
            target_date: today,
        });
        await client.createComment(projectId, issueId, `<p>🔄 [${time}] 유저가 수동 복원</p>`);

        await this.sendMessage(roomId, `🔄 "${issue.name}" 퀘스트를 오늘로 복원했어요!`, '#2ecc71');
    }

    private async handleStart(issueId: string, roomId: string): Promise<void> {
        const client = await getPlaneClient(this.read, this.http);
        const projectId = await getRoutineProjectId(this.read);
        const time = nowTimeString();

        const startedState = await client.findStateByGroup(projectId, 'started');
        if (!startedState) {
            await this.sendMessage(roomId, '⚠️ started 상태를 찾을 수 없어요.');
            return;
        }

        const issue = await client.getIssue(projectId, issueId);
        await client.updateIssue(projectId, issueId, { state: startedState.id });
        await client.createComment(projectId, issueId, `<p>▶️ [${time}] 시작</p>`);

        await this.sendMessage(roomId, `▶️ "${issue.name}" 퀘스트를 시작했어요!`, '#f39c12');
    }

    private async handleRegen(value: string, roomId: string): Promise<void> {
        if (value === 'cancel') {
            await this.sendMessage(roomId, '↩️ 재생성이 취소되었어요.');
            return;
        }
        if (value !== 'confirm') return;

        const client = await getPlaneClient(this.read, this.http);
        const projectId = await getRoutineProjectId(this.read);
        const states = await client.listStates(projectId);
        const { items: todayItems } = await client.getTodayIssues(projectId, states);
        const deletable = todayItems.filter((item) => item.state.group !== 'completed');

        let deleted = 0;
        for (const item of deletable) {
            await client.deleteIssue(projectId, item.issue.id);
            deleted++;
        }

        // Re-copy routine tasks
        const todoState = states.find(
            (s) => (s.group === 'unstarted' || s.group === 'backlog') && !s.name.toLowerCase().includes('deferred'),
        );
        let copiedCount = 0;

        if (todoState) {
            const today = todayString();
            const projects = await client.listProjects();
            const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
            const todayDate = new Date(today + 'T12:00:00+09:00');
            const todayDay = dayNames[todayDate.getUTCDay()];

            const targetLabels = await client.listLabels(projectId);
            const targetLabelByName = new Map(targetLabels.map((l) => [l.name.toLowerCase(), l.id]));
            const EXCLUDED_LABELS = new Set(['on', 'off']);

            // Get Done issues to avoid re-creating already completed ones
            const doneSourceIds = new Set(
                todayItems
                    .filter((item) => item.state.group === 'completed')
                    .map((item) => item.meta.source_issue_id)
                    .filter(Boolean),
            );

            for (const project of projects) {
                if (project.id === projectId) continue;
                const labels = await client.listLabels(project.id);
                const routineLabel = labels.find((l) => l.name.toLowerCase() === 'daily-routine');
                if (!routineLabel) continue;
                const onLabel = labels.find((l) => l.name.toLowerCase() === 'on');
                const sourceLabelById = new Map(labels.map((l) => [l.id, l.name]));

                const issues = await client.listIssues(project.id);
                const routineIssues = issues.filter((i) => {
                    const hasRoutine = i.labels.includes(routineLabel.id);
                    const isOn = onLabel ? i.labels.includes(onLabel.id) : true;
                    return hasRoutine && isOn;
                });

                for (const routine of routineIssues) {
                    if (doneSourceIds.has(routine.id)) continue;
                    const meta = PlaneClient.parseMeta(routine.description_html);
                    if (meta.routine_active_from && meta.routine_active_from > today) continue;
                    if (meta.routine_active_until && meta.routine_active_until < today) continue;
                    if (meta.routine_days?.length && !meta.routine_days.includes(todayDay)) continue;

                    const questMeta: PulsarMeta = {
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
                        `<p>${routine.name}</p>`, questMeta);

                    const questLabels = routine.labels
                        .map((id) => sourceLabelById.get(id))
                        .filter((name): name is string => !!name && !EXCLUDED_LABELS.has(name.toLowerCase()))
                        .map((name) => targetLabelByName.get(name.toLowerCase()))
                        .filter((id): id is string => !!id);

                    await client.createIssue(projectId, {
                        name: routine.name,
                        description_html: descHtml,
                        state: todoState.id,
                        priority: routine.priority,
                        target_date: today,
                        labels: questLabels,
                    } as any);
                    copiedCount++;
                }
            }
        }

        const fields: Array<{ title: string; value: string; short: boolean }> = [
            { title: '🗑️ 삭제', value: `${deleted}개`, short: true },
        ];
        if (copiedCount > 0) fields.push({ title: '📋 재생성', value: `${copiedCount}개`, short: true });

        await this.sendAttachment(roomId, {
            color: '#2ecc71',
            text: '🔄 퀘스트 재생성 완료',
            fields,
        });
    }

    private async handleDelete(issueId: string, roomId: string): Promise<void> {
        const client = await getPlaneClient(this.read, this.http);
        const projectId = await getRoutineProjectId(this.read);

        const issue = await client.getIssue(projectId, issueId);
        await client.deleteIssue(projectId, issueId);

        await this.sendMessage(roomId, `🗑️ "${issue.name}" 퀘스트를 삭제했어요.`, '#e74c3c');
    }

    private async sendMessage(roomId: string, text: string, color: string = '#3498db'): Promise<void> {
        const room = await this.read.getRoomReader().getById(roomId);
        if (!room) return;
        const msg = this.modify.getCreator().startMessage()
            .setRoom(room)
            .setAttachments([{ color, text }]);
        await this.modify.getCreator().finish(msg);
    }

    private async sendAttachment(roomId: string, attachment: any): Promise<void> {
        const room = await this.read.getRoomReader().getById(roomId);
        if (!room) return;
        const msg = this.modify.getCreator().startMessage()
            .setRoom(room)
            .setAttachments([attachment]);
        await this.modify.getCreator().finish(msg);
    }
}
