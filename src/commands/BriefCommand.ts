import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { dDay } from '../ui/formatters';
import { buildBriefAttachments } from '../ui/blocks';
import { calculateProgress, loadProgress, saveProgress, ProgressResult } from '../plane/progress';

export class BriefCommand implements ISlashCommand {
    public command = 'brief';
    public i18nParamsExample = '[all]';
    public i18nDescription = '마일스톤 브리핑을 보여줍니다';
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
            const showAll = args.length > 0 && args[0].toLowerCase() === 'all';

            // 먼저 저장된 값 읽기, 없으면 실시간 계산 후 저장
            let progressResults: ProgressResult[] = await loadProgress(read.getPersistenceReader());

            if (progressResults.length === 0) {
                const client = await getPlaneClient(read, http);
                const routineProjectId = await getRoutineProjectId(read);
                progressResults = await calculateProgress(client, routineProjectId);
                await saveProgress(persis, progressResults);
            }

            progressResults.sort((a, b) => a.endDate.localeCompare(b.endDate));

            const limit = showAll ? progressResults.length : 5;
            const displayed = progressResults.slice(0, limit);
            const label = showAll ? '전체' : `Top ${Math.min(limit, displayed.length)}`;

            const cycles = displayed.map((r) => ({
                name: r.name,
                projectName: r.projectName,
                dDayStr: dDay(r.endDate),
                dateStr: r.endDate,
                pct: Math.round(r.rate * 100),
                completed: r.completedCount,
                total: r.expectedCount,
                type: r.type,
            }));

            const attachments = buildBriefAttachments(cycles, label);
            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setAttachments(attachments);
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
