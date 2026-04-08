import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { todayString, dayOfWeek } from '../ui/formatters';
import { buildReportAttachments } from '../ui/blocks';

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
                    .setAttachments([{ color: '#2ecc71', text: '📭 오늘 등록된 퀘스트가 없습니다.' }]);
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

            const incomplete = todayItems.filter(
                (i) => i.state.group !== 'completed' && i.state.group !== 'cancelled',
            );
            const incompleteNames = incomplete.slice(0, 5).map((i) => i.issue.name);
            if (incomplete.length > 5) incompleteNames.push(`... 외 ${incomplete.length - 5}개`);

            const attachments = buildReportAttachments(
                today, dow, done, total, rate, totalTime, remaining, deferred, incompleteNames,
            );
            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setAttachments(attachments);
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
