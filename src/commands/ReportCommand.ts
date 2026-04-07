import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { todayString, dayOfWeek, formatDuration, progressBar } from '../ui/formatters';

export class ReportCommand implements ISlashCommand {
    public command = 'report';
    public i18nParamsExample = '';
    public i18nDescription = '오늘의 일일 리포트를 표시합니다 (W3)';
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
            const dow = dayOfWeek(today);
            const states = await client.listStates(projectId);
            const todayItems = await client.getTodayIssues(projectId, states);

            const total = todayItems.length;
            if (total === 0) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setText('📭 오늘 등록된 퀘스트가 없습니다.');
                await modify.getCreator().finish(msg);
                return;
            }

            const done = todayItems.filter((i) => i.state.group === 'completed').length;
            const cancelled = todayItems.filter((i) => i.state.group === 'cancelled').length;
            const deferred = todayItems.filter((i) => i.state.name.toLowerCase().includes('deferred')).length;
            const remaining = total - done - cancelled;
            const rate = Math.round((done / total) * 100);
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

            if (rate >= 90) text += '\n🏆 완벽한 하루였어요!';
            else if (rate >= 70) text += '\n💪 잘 해냈어요!';
            else if (rate >= 50) text += '\n🌱 절반 이상 해냈어요!';
            else text += '\n☕ 오늘은 쉬어가는 날!';

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
