import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { PlaneClient } from '../plane/PlaneClient';
import { IssueDisplayItem, priorityEmoji, formatTime } from '../ui/formatters';

export class RestoreCommand implements ISlashCommand {
    public command = 'restore';
    public i18nParamsExample = '';
    public i18nDescription = '연기된 퀘스트를 복원합니다';
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

            const deferredStateIds = new Set(
                states
                    .filter((s) => s.name.toLowerCase().includes('deferred'))
                    .map((s) => s.id),
            );

            if (deferredStateIds.size === 0) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setText('⚠️ Deferred 상태를 찾을 수 없어요.');
                await modify.getCreator().finish(msg);
                return;
            }

            const allIssues = await client.listIssues(projectId);
            const stateMap = new Map(states.map((s) => [s.id, s]));

            const deferredItems: IssueDisplayItem[] = allIssues
                .filter((issue) => deferredStateIds.has(issue.state))
                .map((issue) => ({
                    issue,
                    state: stateMap.get(issue.state)!,
                    meta: PlaneClient.parseMeta(issue.description_html),
                }))
                .filter((item) => item.state);

            if (deferredItems.length === 0) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setText('✅ 복원할 연기된 퀘스트가 없어요!');
                await modify.getCreator().finish(msg);
                return;
            }

            const block = modify.getCreator().getBlockBuilder();

            for (const item of deferredItems) {
                const p = priorityEmoji(item.issue.priority);
                const deferCount = item.meta.defer_count || 0;
                const origDate = item.meta.original_quest_date || '?';
                const label = `${p} ${item.issue.name} — 연기 ${deferCount}회 | 원래 날짜: ${origDate}`;

                block.addActionsBlock({
                    blockId: 'restore_block',
                    elements: [
                        block.newButtonElement({
                            actionId: `restore_${item.issue.id}`,
                            text: block.newPlainTextObject(label.substring(0, 75)),
                            value: item.issue.id,
                        }),
                    ],
                });
            }

            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setText('🔄 복원할 퀘스트를 선택하세요:')
                .setBlocks(block);
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
