import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IJobContext, IProcessor } from '@rocket.chat/apps-engine/definition/scheduler';
import { getPlaneClient, getRoutineProjectId } from '../commands/_helpers';
import { todayString, dayOfWeek, formatDuration, progressBar } from '../ui/formatters';
import { buildReportAttachments } from '../ui/blocks';

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
            if (total === 0) return;

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

            const generalRoom = await read.getRoomReader().getByName('general');
            if (generalRoom) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(generalRoom)
                    .setAttachments(attachments);
                await modify.getCreator().finish(msg);
            }
        } catch (error) {
            // Scheduler errors are logged by the engine
        }
    }
}
