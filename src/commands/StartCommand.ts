import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { nowTimeString, IssueDisplayItem } from '../ui/formatters';
import { buildIssueButtonList } from '../ui/blocks';

export class StartCommand implements ISlashCommand {
    public command = 'start';
    public i18nParamsExample = '{task name or number}';
    public i18nDescription = '태스크를 시작 상태로 변경합니다';
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
            const todayItems = await client.getTodayIssues(projectId, states);

            // Filter to To-Do (unstarted) issues
            const todoItems = todayItems.filter((item) => item.state.group === 'unstarted');
            // Track in-progress issues for warning
            const inProgressItems = todayItems.filter((item) => item.state.group === 'started');

            const arg = context.getArguments().join(' ').trim();

            // Find the started state
            const startedState = await client.findStateByGroup(projectId, 'started');
            if (!startedState) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setAttachments([{ color: '#e74c3c', text: '❌ started 상태를 찾을 수 없습니다.' }]);
                await modify.getCreator().finish(msg);
                return;
            }

            // No argument: show interactive buttons
            if (!arg) {
                if (todoItems.length === 0) {
                    const msg = modify.getCreator().startMessage()
                        .setRoom(context.getRoom())
                        .setAttachments([{ color: '#3498db', text: '📝 시작할 수 있는 대기 중인 퀘스트가 없습니다.' }]);
                    await modify.getCreator().finish(msg);
                    return;
                }

                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom());

                const block = modify.getCreator().getBlockBuilder();
                block.addSectionBlock({
                    text: block.newMarkdownTextObject('🚀 시작할 퀘스트를 선택하세요:'),
                });
                buildIssueButtonList(block, todoItems, 'start');
                msg.setBlocks(block);

                await modify.getCreator().finish(msg);
                return;
            }

            // Argument given: find matching issue by number or partial name
            let matched: IssueDisplayItem | undefined;
            const argNum = parseInt(arg, 10);

            if (!isNaN(argNum) && argNum >= 1 && argNum <= todoItems.length) {
                matched = todoItems[argNum - 1];
            } else {
                const lowerArg = arg.toLowerCase();
                matched = todoItems.find((item) =>
                    item.issue.name.toLowerCase().includes(lowerArg),
                );
            }

            if (!matched) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setAttachments([{ color: "#f39c12", text: `⚠️ '${arg}'에 해당하는 퀘스트를 찾을 수 없습니다.` }]);
                await modify.getCreator().finish(msg);
                return;
            }

            // Change state to started
            await client.updateIssue(projectId, matched.issue.id, {
                state: startedState.id,
            });

            // Add comment
            const timeNow = nowTimeString();
            await client.createComment(
                projectId,
                matched.issue.id,
                `<p>▶️ [${timeNow}] 시작</p>`,
            );

            const fields: Array<{ title: string; value: string; short: boolean }> = [];
            if (inProgressItems.length > 0) {
                for (const item of inProgressItems) {
                    fields.push({ title: '🔄 병행 중', value: item.issue.name, short: true });
                }
            }

            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setAttachments([{
                    color: '#f39c12',
                    title: { value: `▶️ '${matched.issue.name}' 시작!` },
                    fields: fields.length > 0 ? fields : undefined,
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
