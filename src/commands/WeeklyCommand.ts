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

            // Calculate Mon-Sun of current week
            const today = todayString();
            const todayDate = new Date(today + 'T00:00:00+09:00');
            const dayIdx = todayDate.getDay(); // 0=Sun, 1=Mon, ...
            const mondayOffset = dayIdx === 0 ? -6 : 1 - dayIdx;
            const monday = new Date(todayDate);
            monday.setDate(monday.getDate() + mondayOffset);

            const weekDates: string[] = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(monday);
                d.setDate(d.getDate() + i);
                weekDates.push(d.toISOString().split('T')[0]);
            }

            // Map issues to dates
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

            // Aggregate week stats
            let weekTotal = 0;
            let weekDone = 0;
            let weekCancelled = 0;

            const weekStart = weekDates[0];
            const weekEnd = weekDates[6];

            let text = `📅 주간 회고 (${weekStart} ~ ${weekEnd})\n\n`;

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
                    text += `${shortDate}(${dow}) | ░░░░░░░░░░ —%\n`;
                } else {
                    text += `${shortDate}(${dow}) | ${bar} ${pct}% (${stat.done}/${stat.total})${marker}\n`;
                }
            }

            const weekEffective = weekTotal - weekCancelled;
            const weekRate = weekEffective > 0 ? weekDone / weekEffective : 0;

            text += `\n📊 주간 종합\n`;
            text += `• 전체: ${weekTotal}개 | 완료: ${weekDone}개 | 취소: ${weekCancelled}개\n`;
            text += `• 주간 완료율: ${Math.round(weekRate * 100)}%\n`;

            // LLM placeholder
            text += `\n💬 주간 회고 분석은 추후 연동 예정입니다.`;

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
