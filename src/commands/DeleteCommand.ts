import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { buildIssueButtonList } from '../ui/blocks';

export class DeleteCommand implements ISlashCommand {
    public command = 'delete';
    public i18nParamsExample = '';
    public i18nDescription = '오늘의 퀘스트를 삭제합니다';
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
            const { items: todayItems } = await client.getTodayIssues(projectId, states);

            // 완료된 것 제외, 나머지 삭제 가능
            const deletable = todayItems.filter(
                (item) => item.state.group !== 'completed',
            );

            if (deletable.length === 0) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setAttachments([{ color: '#2ecc71', text: '✅ 삭제할 퀘스트가 없어요!' }]);
                await modify.getCreator().finish(msg);
                return;
            }

            const block = modify.getCreator().getBlockBuilder();
            buildIssueButtonList(block, deletable, 'delete', `🗑️ 삭제할 퀘스트를 선택하세요 (${deletable.length}개)`);

            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setBlocks(block);
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
