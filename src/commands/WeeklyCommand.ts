import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { PlaneClient } from '../plane/PlaneClient';
import { PlaneState } from '../plane/types';
import { progressBar, todayString, dayOfWeek } from '../ui/formatters';
import { buildWeeklyAttachments } from '../ui/blocks';

export class WeeklyCommand implements ISlashCommand {
    public command = 'weekly';
    public i18nParamsExample = '';
    public i18nDescription = '이번 주 회고를 보여줍니다';
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

            const issues = await client.listIssues(projectId);
            const states = await client.listStates(projectId);
            const stateMap = new Map<string, PlaneState>(states.map((s) => [s.id, s]));

            const today = todayString();
            const todayDate = new Date(today + 'T12:00:00+09:00');
            const dayIdx = todayDate.getUTCDay();
            const mondayOffset = dayIdx === 0 ? -6 : 1 - dayIdx;
            const monday = new Date(todayDate);
            monday.setDate(monday.getDate() + mondayOffset);

            const weekDates: string[] = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(monday);
                d.setDate(d.getDate() + i);
                weekDates.push(d.toISOString().split('T')[0]);
            }

            const dateIssueMap = new Map<string, { total: number; done: number; cancelled: number }>();
            for (const d of weekDates) {
                dateIssueMap.set(d, { total: 0, done: 0, cancelled: 0 });
            }

            for (const issue of issues) {
                const meta = PlaneClient.parseMeta(issue.description_html);
                const issueDate = meta.quest_date || issue.target_date;
                if (issueDate && dateIssueMap.has(issueDate)) {
                    const stat = dateIssueMap.get(issueDate)!;
                    stat.total++;
                    const state = stateMap.get(issue.state);
                    if (state) {
                        if (state.group === 'completed') stat.done++;
                        if (state.group === 'cancelled') stat.cancelled++;
                    }
                }
            }

            let weekTotal = 0;
            let weekDone = 0;
            let weekCancelled = 0;
            const dailyLines: string[] = [];

            for (const date of weekDates) {
                const stat = dateIssueMap.get(date)!;
                weekTotal += stat.total;
                weekDone += stat.done;
                weekCancelled += stat.cancelled;

                const dow = dayOfWeek(date);
                const shortDate = date.substring(5);
                const effective = stat.total - stat.cancelled;
                const rate = effective > 0 ? stat.done / effective : 0;
                const bar = progressBar(rate);
                const pct = Math.round(rate * 100);
                const isFuture = date > today;
                const marker = date === today ? ' 👈' : '';

                if (isFuture && stat.total === 0) {
                    dailyLines.push(`${shortDate}(${dow}) | ░░░░░░░░░░ —%`);
                } else {
                    dailyLines.push(`${shortDate}(${dow}) | ${bar} ${pct}% (${stat.done}/${stat.total})${marker}`);
                }
            }

            const weekEffective = weekTotal - weekCancelled;
            const weekRate = weekEffective > 0 ? Math.round((weekDone / weekEffective) * 100) : 0;

            const attachments = buildWeeklyAttachments(
                weekDates[0], weekDates[6], dailyLines,
                weekTotal, weekDone, weekCancelled, weekRate,
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
