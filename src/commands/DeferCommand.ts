import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { formatIssuePickerList } from '../ui/blocks';
import { ActionHandler } from '../handlers/ActionHandler';

export class DeferCommand implements ISlashCommand {
    public command = 'defer';
    public i18nParamsExample = '{번호}';
    public i18nDescription = '오늘의 퀘스트를 연기합니다';
    public providesPreview = false;

    constructor(private readonly app: any) {}

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
            const { items: todayItems } = await client.getTodayIssues(projectId, states);

            const actionable = todayItems.filter(
                (item) => item.state.group === 'unstarted' || item.state.group === 'started',
            );

            if (actionable.length === 0) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setAttachments([{ color: '#2ecc71', text: '✅ 연기할 퀘스트가 없어요!' }]);
                await modify.getCreator().finish(msg);
                return;
            }

            const { sorted, text } = formatIssuePickerList(actionable);
            const arg = context.getArguments().join(' ').trim();
            const argNum = parseInt(arg, 10);

            if (argNum >= 1 && argNum <= sorted.length) {
                const handler = new ActionHandler(this.app, read, http, modify);
                await handler.handleAction(`defer_${sorted[argNum - 1].issue.id}`, context.getSender().id, context.getRoom().id);
                return;
            }

            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setAttachments([{
                    color: '#9b59b6',
                    text: `⏸️  **연기할 퀘스트** (${sorted.length}개)\n\n${text}\n\n> \`/defer {번호}\` 로 선택`,
                }]);
            await modify.getCreator().finish(msg);
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setAttachments([{ color: '#e74c3c', text: `❌ Plane 연결 실패: ${errMsg}` }]);
            await modify.getCreator().finish(msg);
        }
    }
}
