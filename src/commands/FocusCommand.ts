import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { parseDuration, formatDuration, IssueDisplayItem } from '../ui/formatters';

export class FocusCommand implements ISlashCommand {
    public command = 'focus';
    public i18nParamsExample = '{target} {time}';
    public i18nDescription = '포커스 모드를 시작합니다 (타이머 기능 추후 연동 예정)';
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
            if (args.length === 0) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setAttachments([{ color: '#f39c12', text: '⚠️ 사용법: `/focus {태스크명 또는 번호} {시간}`' }]);
                await modify.getCreator().finish(msg);
                return;
            }

            // Parse duration from last token
            let durationMin: number | null = null;
            let targetParts = [...args];

            if (args.length > 1) {
                const lastToken = args[args.length - 1];
                const parsed = parseDuration(lastToken);
                if (parsed !== null) {
                    durationMin = parsed;
                    targetParts = args.slice(0, -1);
                }
            }

            const targetArg = targetParts.join(' ').trim();

            const client = await getPlaneClient(read, http);
            const projectId = await getRoutineProjectId(read);
            const states = await client.listStates(projectId);
            const todayItems = await client.getTodayIssues(projectId, states);

            // Filter to actionable issues (unstarted + started)
            const actionable = todayItems.filter(
                (item) => item.state.group === 'unstarted' || item.state.group === 'started',
            );

            // Find the target issue by number or partial name
            let matched: IssueDisplayItem | undefined;
            const argNum = parseInt(targetArg, 10);

            if (!isNaN(argNum) && argNum >= 1 && argNum <= actionable.length) {
                matched = actionable[argNum - 1];
            } else {
                const lowerArg = targetArg.toLowerCase();
                matched = actionable.find((item) =>
                    item.issue.name.toLowerCase().includes(lowerArg),
                );
            }

            if (!matched) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setAttachments([{ color: '#f39c12', text: `⚠️ '${targetArg}'에 해당하는 퀘스트를 찾을 수 없습니다.` }]);
                await modify.getCreator().finish(msg);
                return;
            }

            // Change to In Progress state
            const startedState = await client.findStateByGroup(projectId, 'started');
            if (startedState && matched.state.group !== 'started') {
                await client.updateIssue(projectId, matched.issue.id, {
                    state: startedState.id,
                });
            }

            const durationDisplay = durationMin ? formatDuration(durationMin) : '지정 안 됨';
            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setAttachments([{ color: '#f39c12', text: `🎯 '${matched.issue.name}' 포커스 모드 시작! (${durationDisplay})` }]);
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
