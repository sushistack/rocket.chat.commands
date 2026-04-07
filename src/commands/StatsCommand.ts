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
import { progressBar, todayString, dayOfWeek, formatIssueOneLiner, IssueDisplayItem } from '../ui/formatters';

interface DayStat {
    date: string;
    total: number;
    done: number;
    cancelled: number;
    deferred: number;
    rate: number;
}

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

            // Build date range (last N days ending today)
            const today = todayString();
            const dates: string[] = [];
            for (let i = days - 1; i >= 0; i--) {
                const d = new Date(today + 'T00:00:00+09:00');
                d.setDate(d.getDate() - i);
                dates.push(d.toISOString().split('T')[0]);
            }

            // Map issues to dates
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

            // Calculate per-day stats
            const dayStats: DayStat[] = [];
            const deferredCounts = new Map<string, number>();
            const completedCounts = new Map<string, number>();

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

                dayStats.push({ date, total, done, cancelled, deferred, rate });
            }

            // Aggregate stats
            const ratesAboveZero = dayStats.filter((d) => d.total > 0);
            const avgRate = ratesAboveZero.length > 0
                ? ratesAboveZero.reduce((sum, d) => sum + d.rate, 0) / ratesAboveZero.length
                : 0;

            // Streak: consecutive days with >= 80% rate (from most recent)
            let streak = 0;
            for (let i = dayStats.length - 1; i >= 0; i--) {
                if (dayStats[i].total > 0 && dayStats[i].rate >= 0.8) {
                    streak++;
                } else if (dayStats[i].total > 0) {
                    break;
                }
            }

            // Top 3 most deferred
            const topDeferred = [...deferredCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);

            // Top 3 most completed
            const topCompleted = [...completedCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3);

            // Format output
            let text = `📊 루틴 통계 (최근 ${days}일)\n\n`;

            // Daily breakdown
            text += `📅 일별 현황\n`;
            for (const stat of dayStats) {
                const dow = dayOfWeek(stat.date);
                const shortDate = stat.date.substring(5); // MM-DD
                const bar = progressBar(stat.rate);
                const pct = Math.round(stat.rate * 100);
                text += `${shortDate}(${dow}) | ${bar} ${pct}% (${stat.done}/${stat.total})`;
                if (stat.deferred > 0) text += ` ⏸️${stat.deferred}`;
                text += '\n';
            }

            // Aggregate
            text += `\n📈 종합\n`;
            text += `• 평균 완료율: ${Math.round(avgRate * 100)}%\n`;
            text += `• 연속 80%+ 달성: ${streak}일 🔥\n`;

            if (topDeferred.length > 0) {
                text += `\n⏸️ 가장 많이 연기된 퀘스트 (Top 3)\n`;
                topDeferred.forEach(([name, count], i) => {
                    text += `${i + 1}. ${name} (${count}회)\n`;
                });
            }

            if (topCompleted.length > 0) {
                text += `\n✅ 가장 많이 완료된 퀘스트 (Top 3)\n`;
                topCompleted.forEach(([name, count], i) => {
                    text += `${i + 1}. ${name} (${count}회)\n`;
                });
            }

            // LLM placeholder
            text += `\n💬 LLM 분석 기능은 추후 연동 예정입니다.`;

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
