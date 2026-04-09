import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { buildIssueButtonList } from '../ui/blocks';

export class DeferCommand implements ISlashCommand {
    public command = 'defer';
    public i18nParamsExample = '';
    public i18nDescription = '오늘의 퀘스트를 연기합니다';
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

            const block = modify.getCreator().getBlockBuilder();
            buildIssueButtonList(block, actionable, 'defer', `⏸️ 연기할 퀘스트를 선택하세요 (${actionable.length}개)\n_3회 이상 연기 시 경고가 표시됩니다._`);

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
