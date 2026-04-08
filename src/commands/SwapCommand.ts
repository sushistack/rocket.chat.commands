import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { PlaneClient } from '../plane/PlaneClient';
import { formatTime, IssueDisplayItem } from '../ui/formatters';

export class SwapCommand implements ISlashCommand {
    public command = 'swap';
    public i18nParamsExample = '{numberA} {numberB}';
    public i18nDescription = '두 퀘스트의 예정 시간을 교환합니다';
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
                    .setAttachments([{ color: '#f39c12', text: '⚠️ 사용법: `/swap {번호A} {번호B}` (예: `/swap 1 3`)' }]);
                await modify.getCreator().finish(msg);
                return;
            }

            const numA = parseInt(args[0], 10);
            const numB = parseInt(args[1], 10);

            if (isNaN(numA) || isNaN(numB) || numA < 1 || numB < 1) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setAttachments([{ color: '#f39c12', text: '⚠️ 유효한 번호를 입력해주세요.' }]);
                await modify.getCreator().finish(msg);
                return;
            }

            if (numA === numB) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setAttachments([{ color: '#f39c12', text: '⚠️ 서로 다른 번호를 입력해주세요.' }]);
                await modify.getCreator().finish(msg);
                return;
            }

            const client = await getPlaneClient(read, http);
            const projectId = await getRoutineProjectId(read);
            const states = await client.listStates(projectId);
            const todayItems = await client.getTodayIssues(projectId, states);

            // Filter to To-Do + In Progress, sort by scheduled_time
            const actionable = todayItems
                .filter((item) => item.state.group === 'unstarted' || item.state.group === 'started')
                .sort((a, b) => {
                    const timeA = a.meta.scheduled_time || '';
                    const timeB = b.meta.scheduled_time || '';
                    return timeA.localeCompare(timeB);
                });

            const max = actionable.length;
            if (numA > max || numB > max) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setAttachments([{ color: '#f39c12', text: `⚠️ 번호는 1~${max} 사이여야 합니다.` }]);
                await modify.getCreator().finish(msg);
                return;
            }

            const itemA = actionable[numA - 1];
            const itemB = actionable[numB - 1];

            // Swap scheduled_time in meta
            const timeA = itemA.meta.scheduled_time;
            const timeB = itemB.meta.scheduled_time;

            if (!timeA && !timeB) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setAttachments([{ color: '#f39c12', text: '⚠️ 시간이 설정되지 않아 교환할 수 없어요.' }]);
                await modify.getCreator().finish(msg);
                return;
            }

            const newMetaA = { ...itemA.meta, scheduled_time: timeB };
            const newMetaB = { ...itemB.meta, scheduled_time: timeA };

            const newDescA = PlaneClient.setMeta(itemA.issue.description_html, newMetaA);
            const newDescB = PlaneClient.setMeta(itemB.issue.description_html, newMetaB);

            // Update both issues
            await Promise.all([
                client.updateIssue(projectId, itemA.issue.id, { description_html: newDescA }),
                client.updateIssue(projectId, itemB.issue.id, { description_html: newDescB }),
            ]);

            const displayTimeA = formatTime(timeA);
            const displayTimeB = formatTime(timeB);
            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setAttachments([{ color: '#2ecc71', text: `🔄 '${itemA.issue.name}'(${displayTimeA}) ↔ '${itemB.issue.name}'(${displayTimeB}) 시간 교환 완료!` }]);
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
