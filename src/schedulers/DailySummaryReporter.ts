import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IJobContext, IProcessor } from '@rocket.chat/apps-engine/definition/scheduler';
import { getPlaneClient, getRoutineProjectId } from '../commands/_helpers';
import { PlaneClient } from '../plane/PlaneClient';
import { todayString, dayOfWeek, formatDuration, progressBar } from '../ui/formatters';

export class DailySummaryReporter implements IProcessor {
    public id = 'daily-summary-reporter';

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
            const dow = dayOfWeek(today);
            const states = await client.listStates(projectId);
            const todayItems = await client.getTodayIssues(projectId, states);

            const total = todayItems.length;
            if (total === 0) return; // No quests today, skip report

            const done = todayItems.filter((i) => i.state.group === 'completed').length;
            const cancelled = todayItems.filter((i) => i.state.group === 'cancelled').length;
            const deferred = todayItems.filter((i) => i.state.name.toLowerCase().includes('deferred')).length;
            const remaining = total - done - cancelled;
            const rate = total > 0 ? Math.round((done / total) * 100) : 0;
            const totalTime = todayItems
                .filter((i) => i.state.group === 'completed')
                .reduce((sum, i) => sum + (i.meta.adjusted_duration_min || 0), 0);

            const bar = progressBar(done / total);

            let text = `📊 ${today} (${dow}) 일일 리포트\n\n`;
            text += `${bar} ${rate}% 달성 (${done}/${total})\n`;
            text += `⏱️ 투자 시간: ${formatDuration(totalTime)}\n`;

            if (remaining > 0) {
                text += `\n📝 미완료: ${remaining}개`;
                if (deferred > 0) text += ` (연기: ${deferred}개)`;
                text += '\n';

                const incomplete = todayItems.filter(
                    (i) => i.state.group !== 'completed' && i.state.group !== 'cancelled',
                );
                for (const item of incomplete.slice(0, 5)) {
                    text += `  • ${item.issue.name}\n`;
                }
                if (incomplete.length > 5) {
                    text += `  ... 외 ${incomplete.length - 5}개\n`;
                }
            }

            // Encouragement based on rate
            if (rate >= 90) {
                text += '\n🏆 완벽한 하루였어요! 내일도 화이팅!';
            } else if (rate >= 70) {
                text += '\n💪 잘 해냈어요! 꾸준히 가봅시다!';
            } else if (rate >= 50) {
                text += '\n🌱 절반 이상 해냈어요. 내일은 더 잘할 수 있어요!';
            } else {
                text += '\n☕ 오늘은 좀 쉬어가는 날이었나 봐요. 괜찮아요!';
            }

            text += '\n\n💬 AI 분석 코멘트는 추후 연동 예정입니다.';

            // Post to general channel or the app's configured channel
            const generalRoom = await read.getRoomReader().getByName('general');
            if (generalRoom) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(generalRoom)
                    .setText(text);
                await modify.getCreator().finish(msg);
            }
        } catch (error) {
            // Scheduler errors are logged by the engine
        }
    }
}
