import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { nowTimeString, IssueDisplayItem } from '../ui/formatters';

export class MemoCommand implements ISlashCommand {
    public command = 'memo';
    public i18nParamsExample = '{target} {content}';
    public i18nDescription = '퀘스트에 메모를 추가합니다';
    public providesPreview = false;

    public async executor(
        context: SlashCommandContext,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<void> {
        try {
            const args = context.getArguments();
            if (args.length < 2) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setAttachments([{ color: '#f39c12', text: '⚠️ 사용법: `/memo {태스크명 또는 번호} {메모 내용}`' }]);
                await modify.getCreator().finish(msg);
                return;
            }

            const client = await getPlaneClient(read, http);
            const projectId = await getRoutineProjectId(read);
            const states = await client.listStates(projectId);
            const todayItems = await client.getTodayIssues(projectId, states);

            // Determine target and content
            let matched: IssueDisplayItem | undefined;
            let content: string;

            const firstArg = args[0];
            const argNum = parseInt(firstArg, 10);

            if (!isNaN(argNum) && argNum >= 1 && argNum <= todayItems.length) {
                // First arg is an issue number
                matched = todayItems[argNum - 1];
                content = args.slice(1).join(' ');
            } else {
                // Try to find by partial name match
                // Strategy: try progressively longer prefixes as target name
                const lowerArgs = args.map((a) => a.toLowerCase());
                for (let i = 1; i < args.length; i++) {
                    const candidateName = args.slice(0, i).join(' ').toLowerCase();
                    const found = todayItems.find((item) =>
                        item.issue.name.toLowerCase().includes(candidateName),
                    );
                    if (found) {
                        matched = found;
                        content = args.slice(i).join(' ');
                        break;
                    }
                }

                if (!matched) {
                    // Fallback: first token as target, rest as content
                    const lowerFirst = firstArg.toLowerCase();
                    matched = todayItems.find((item) =>
                        item.issue.name.toLowerCase().includes(lowerFirst),
                    );
                    content = args.slice(1).join(' ');
                }

                // @ts-ignore - content is always assigned if matched is found
                if (!matched) {
                    const msg = modify.getCreator().startMessage()
                        .setRoom(context.getRoom())
                        .setAttachments([{ color: '#f39c12', text: `⚠️ '${firstArg}'에 해당하는 퀘스트를 찾을 수 없습니다.` }]);
                    await modify.getCreator().finish(msg);
                    return;
                }
            }

            const timeNow = nowTimeString();
            await client.createComment(
                projectId,
                matched!.issue.id,
                `<p>📝 [${timeNow}] ${content!}</p>`,
            );

            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setAttachments([{ color: '#2ecc71', text: `📝 '${matched!.issue.name}'에 메모 추가 완료!` }]);
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
