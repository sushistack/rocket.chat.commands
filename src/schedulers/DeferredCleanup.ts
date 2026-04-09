import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IJobContext, IProcessor } from '@rocket.chat/apps-engine/definition/scheduler';
import { getPlaneClient, getRoutineProjectId } from '../commands/_helpers';
import { PlaneClient } from '../plane/PlaneClient';
import { todayString } from '../ui/formatters';

export class DeferredCleanup implements IProcessor {
    public id = 'deferred-cleanup';

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

            const cancelledState = states.find((s) => s.group === 'cancelled');
            if (!cancelledState) return;

            const issues = await client.listIssues(projectId);
            const stateMap = new Map(states.map((s) => [s.id, s]));

            const deferredIssues = issues.filter((i) => {
                const state = stateMap.get(i.state);
                return state && state.name.toLowerCase().includes('deferred');
            });

            let autoCancelled = 0;
            const report: string[] = [];
            const todayMs = new Date(today + 'T00:00:00+09:00').getTime();

            for (const issue of deferredIssues) {
                const meta = PlaneClient.parseMeta(issue.description_html);
                const deferCount = meta.defer_count || 0;
                const questDate = meta.quest_date || issue.target_date;
                const questMs = questDate ? new Date(questDate + 'T00:00:00+09:00').getTime() : NaN;
                const elapsedDays = !isNaN(questMs)
                    ? Math.floor((todayMs - questMs) / (1000 * 60 * 60 * 24))
                    : 0;

                // Auto-cancel if 3+ days elapsed and not mandatory
                if (elapsedDays >= 3) {
                    const isMandatory = meta.routine_mandatory === true;
                    if (!isMandatory) {
                        await client.updateIssue(projectId, issue.id, {
                            state: cancelledState.id,
                        });
                        await client.createComment(
                            projectId,
                            issue.id,
                            `<p>🗑️ [${today}] ${elapsedDays}일 경과로 자동 취소됨. 필요시 /restore로 복원 가능</p>`,
                        );
                        autoCancelled++;
                        report.push(`  ❌ ${issue.name} (${elapsedDays}일 경과 → 자동 취소)`);
                    } else {
                        report.push(`  ⚠️ ${issue.name} (${elapsedDays}일 경과, 필수 루틴 → 유지)`);
                    }
                } else if (deferCount >= 2) {
                    report.push(`  ⏸️ ${issue.name} (${deferCount}회 연기, ${elapsedDays}일 경과)`);
                }
            }

            // Post weekly report if there's anything to report
            if (report.length > 0) {
                const summaryText = report.join('\n');
                const generalRoom = await read.getRoomReader().getByName('general');
                if (generalRoom) {
                    const msg = modify.getCreator().startMessage()
                        .setRoom(generalRoom)
                        .setAttachments([{
                            color: '#9b59b6',
                            text: `🧹 주간 Deferred 정리 (${today})`,
                            fields: [
                                { title: '📋 상세', value: summaryText, short: false },
                                { title: '총 연기', value: `${deferredIssues.length}`, short: true },
                                { title: '자동 취소', value: `${autoCancelled}`, short: true },
                            ],
                        }]);
                    await modify.getCreator().finish(msg);
                }
            }
        } catch (error) {
            throw error;
        }
    }
}
