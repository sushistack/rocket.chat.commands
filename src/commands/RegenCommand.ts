import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { ActionHandler } from '../handlers/ActionHandler';

export class RegenCommand implements ISlashCommand {
    public command = 'regen';
    public i18nParamsExample = 'confirm';
    public i18nDescription = '오늘의 퀘스트를 재생성합니다';
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

            const deletable = todayItems.filter((item) => item.state.group !== 'completed');

            if (deletable.length === 0) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setAttachments([{ color: '#3498db', text: 'ℹ️ 삭제할 미완료 퀘스트가 없습니다.' }]);
                await modify.getCreator().finish(msg);
                return;
            }

            const arg = context.getArguments().join(' ').trim();

            if (arg === 'confirm') {
                const handler = new ActionHandler(this.app, read, http, modify);
                await handler.handleAction('regen_confirm', context.getSender().id, context.getRoom().id);
                return;
            }

            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setAttachments([{
                    color: '#f39c12',
                    text: `⚠️  **퀘스트 재생성**\n\nDone을 제외한 오늘의 퀘스트 **${deletable.length}개**가 삭제됩니다.\n\n> \`/regen confirm\` 으로 진행`,
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
