import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient } from './_helpers';
import { dDay, progressBar } from '../ui/formatters';
import { PlaneCycle, PlaneProject } from '../plane/types';
import { buildBriefAttachments } from '../ui/blocks';

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
            const client = await getPlaneClient(read, http);
            const args = context.getArguments();
            const showAll = args.length > 0 && args[0].toLowerCase() === 'all';

            const projects = await client.listProjects();

            const allCycles: { cycle: PlaneCycle; project: PlaneProject }[] = [];

            for (const project of projects) {
                const cycles = await client.listCycles(project.id, showAll ? undefined : 'incomplete');
                for (const cycle of cycles) {
                    allCycles.push({ cycle, project });
                }
            }

            allCycles.sort((a, b) => {
                if (!a.cycle.end_date && !b.cycle.end_date) return 0;
                if (!a.cycle.end_date) return 1;
                if (!b.cycle.end_date) return -1;
                return a.cycle.end_date.localeCompare(b.cycle.end_date);
            });

            const limit = showAll ? allCycles.length : 5;
            const displayed = allCycles.slice(0, limit);
            const label = showAll ? '전체' : `Top ${Math.min(limit, displayed.length)}`;

            const cycles = displayed.map(({ cycle, project }) => {
                const total = cycle.total_issues || 0;
                const completed = cycle.completed_issues || 0;
                const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                return {
                    name: cycle.name,
                    projectName: project.name,
                    dDayStr: cycle.end_date ? dDay(cycle.end_date) : '미정',
                    dateStr: cycle.end_date ? cycle.end_date.split('T')[0] : '미정',
                    pct,
                    completed,
                    total,
                };
            });

            const attachments = buildBriefAttachments(cycles, label);
            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setAttachments(attachments);
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
