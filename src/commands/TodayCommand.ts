import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import {
    formatIssueOneLiner,
    formatTodaySummary,
    groupIssuesByState,
    stateGroupEmoji,
    stateGroupLabel,
    IssueDisplayItem,
} from '../ui/formatters';

export class TodayCommand implements ISlashCommand {
    public command = 'today';
    public i18nParamsExample = '';
    public i18nDescription = '오늘의 퀘스트 현황을 보여줍니다';
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
            const states = await client.listStates(projectId);
            const items = await client.getTodayIssues(projectId, states);

            const grouped = groupIssuesByState(items);
            let text = formatTodaySummary(items);

            if (items.length === 0) {
                text += '🎉 오늘 등록된 퀘스트가 없습니다.\n';
            } else {
                let idx = 1;
                const groupOrder = [
                    { key: 'unstarted', emoji: '📝', label: 'To-Do' },
                    { key: 'backlog', emoji: '📦', label: 'Backlog' },
                    { key: 'started', emoji: '🔄', label: 'In Progress' },
                    { key: 'completed', emoji: '✅', label: 'Done' },
                    { key: 'cancelled', emoji: '❌', label: 'Canceled' },
                ];
                // Also handle deferred (which may be in any group)
                const deferredItems = items.filter((i) => i.state.name.toLowerCase().includes('deferred'));
                const nonDeferredGrouped = groupIssuesByState(
                    items.filter((i) => !i.state.name.toLowerCase().includes('deferred')),
                );

                for (const { key, emoji, label } of groupOrder) {
                    const groupItems = nonDeferredGrouped.get(key) || [];
                    if (groupItems.length === 0) continue;
                    text += `\n${emoji} **${label}**\n`;
                    for (const item of groupItems) {
                        text += `  ${formatIssueOneLiner(item, idx)}\n`;
                        idx++;
                    }
                }

                if (deferredItems.length > 0) {
                    text += `\n⏸️ **Deferred**\n`;
                    for (const item of deferredItems) {
                        text += `  ${formatIssueOneLiner(item, idx)}\n`;
                        idx++;
                    }
                }
            }

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
