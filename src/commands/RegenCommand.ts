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
    public i18nParamsExample = '';
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
            const handler = new ActionHandler(this.app, read, http, modify);
            await handler.handleAction('regen_confirm', context.getSender().id, context.getRoom().id);
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setAttachments([{ color: '#e74c3c', text: `❌ Plane 연결 실패: ${errMsg}` }]);
            await modify.getCreator().finish(msg);
        }
    }
}
