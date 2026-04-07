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

            for (const issue of deferredIssues) {
                const meta = PlaneClient.parseMeta(issue.description_html);
                const deferCount = meta.defer_count || 0;

                // Auto-cancel if deferred 7+ times and not mandatory
                if (deferCount >= 7) {
                    const isMandatory = meta.routine_mandatory === true;
                    if (!isMandatory) {
                        await client.updateIssue(projectId, issue.id, {
                            state: cancelledState.id,
                        });
                        await client.createComment(
                            projectId,
                            issue.id,
                            `<p>🗑️ [${today}] ${deferCount}회 이상 연기로 자동 취소됨. 필요시 /restore로 복원 가능</p>`,
                        );
                        autoCancelled++;
                        report.push(`  ❌ ${issue.name} (${deferCount}회 연기 → 자동 취소)`);
                    } else {
                        report.push(`  ⚠️ ${issue.name} (${deferCount}회 연기, 필수 루틴 → 유지)`);
                    }
                } else if (deferCount >= 3) {
                    report.push(`  ⏸️ ${issue.name} (${deferCount}회 연기)`);
                }
            }

            // Post weekly report if there's anything to report
            if (report.length > 0) {
                let text = `🧹 주간 Deferred 정리 리포트 (${today})\n\n`;
                text += `총 연기 태스크: ${deferredIssues.length}개\n`;
                if (autoCancelled > 0) {
                    text += `자동 취소: ${autoCancelled}개\n`;
                }
                text += '\n' + report.join('\n');
                text += '\n\n💡 LLM 기반 판단은 추후 n8n에서 연동 예정입니다.';

                const generalRoom = await read.getRoomReader().getByName('general');
                if (generalRoom) {
                    const msg = modify.getCreator().startMessage()
                        .setRoom(generalRoom)
                        .setText(text);
                    await modify.getCreator().finish(msg);
                }
            }
        } catch (error) {
            // Scheduler errors are logged by the engine
        }
    }
}
