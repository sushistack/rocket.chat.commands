import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { PlaneClient } from '../plane/PlaneClient';
import { PlaneIssue, PlaneState } from '../plane/types';
import { progressBar, todayString, dayOfWeek } from '../ui/formatters';
import { buildStatsAttachments } from '../ui/blocks';

export class StatsCommand implements ISlashCommand {
    public command = 'stats';
    public i18nParamsExample = '[일수 (기본 7, 최대 90)]';
    public i18nDescription = '루틴 프로젝트의 통계를 보여줍니다';
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
            const args = context.getArguments();

            let days = 7;
            if (args.length > 0) {
                const parsed = parseInt(args[0], 10);
                if (!isNaN(parsed) && parsed > 0) {
                    days = Math.min(parsed, 90);
                }
            }

            const issues = await client.listIssues(projectId);
            const states = await client.listStates(projectId);
            const stateMap = new Map<string, PlaneState>(states.map((s) => [s.id, s]));

            const today = todayString();
            const dates: string[] = [];
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(today + 'T00:00:00+09:00');
                d.setDate(d.getDate() - i);
                dates.push(d.toISOString().split('T')[0]);
            }

            const dateIssueMap = new Map<string, PlaneIssue[]>();
            for (const d of dates) {
                dateIssueMap.set(d, []);
            }

            for (const issue of issues) {
                const meta = PlaneClient.parseMeta(issue.description_html);
                const issueDate = meta.quest_date || issue.target_date;
                if (issueDate && dateIssueMap.has(issueDate)) {
                    dateIssueMap.get(issueDate)!.push(issue);
                }
            }

            const dailyLines: string[] = [];
            const deferredCounts = new Map<string, number>();
            const completedCounts = new Map<string, number>();
            const ratesAboveZero: number[] = [];
            let streak = 0;
            let streakBroken = false;

            const dayStats: Array<{ total: number; rate: number }> = [];

            for (const date of dates) {
                const dayIssues = dateIssueMap.get(date)!;
                const total = dayIssues.length;
                let done = 0;
                let cancelled = 0;
                let deferred = 0;

                for (const issue of dayIssues) {
                    const state = stateMap.get(issue.state);
                    if (!state) continue;
                    if (state.group === 'completed') {
                        done++;
                        completedCounts.set(issue.name, (completedCounts.get(issue.name) || 0) + 1);
                    }
                    if (state.group === 'cancelled') cancelled++;
                    if (state.name.toLowerCase().includes('deferred')) {
                        deferred++;
                        deferredCounts.set(issue.name, (deferredCounts.get(issue.name) || 0) + 1);
                    }
                }

                const effective = total - cancelled;
                const rate = effective > 0 ? done / effective : 0;
                if (total > 0) ratesAboveZero.push(rate);
                dayStats.push({ total, rate });

                const dow = dayOfWeek(date);
                const shortDate = date.substring(5);
                const bar = progressBar(rate);
                const pct = Math.round(rate * 100);
                let line = `${shortDate}(${dow}) | ${bar} ${pct}% (${done}/${total})`;
                if (deferred > 0) line += ` ⏸️${deferred}`;
                dailyLines.push(line);
            }

            // Streak from most recent
            for (let i = dayStats.length - 1; i >= 0; i--) {
                if (dayStats[i].total > 0 && dayStats[i].rate >= 0.8) {
                    streak++;
                } else if (dayStats[i].total > 0) {
                    break;
                }
            }

            const avgRate = ratesAboveZero.length > 0
                ? Math.round(ratesAboveZero.reduce((s, r) => s + r, 0) / ratesAboveZero.length * 100)
                : 0;

            const topDeferred = [...deferredCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
            const topCompleted = [...completedCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

            const attachments = buildStatsAttachments(days, dailyLines, avgRate, streak, topDeferred, topCompleted);
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
