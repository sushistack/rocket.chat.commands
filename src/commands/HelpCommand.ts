import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { buildHelpAttachments } from '../ui/blocks';

export class HelpCommand implements ISlashCommand {
    public command = 'pulsar-help';
    public i18nParamsExample = '';
    public i18nDescription = 'Pulsar 명령어 도움말을 보여줍니다';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        const attachments = buildHelpAttachments();
        const msg = modify.getCreator().startMessage()
            .setRoom(context.getRoom())
            .setAttachments(attachments);
        await modify.getCreator().finish(msg);
    }
}
