import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { PlaneClient } from '../plane/PlaneClient';
import { PlaneProject } from '../plane/types';
import { buildDeferredAttachments } from '../ui/blocks';

export class DeferredCommand implements ISlashCommand {
    public command = 'deferred';
    public i18nParamsExample = '';
    public i18nDescription = '연기된 퀘스트 목록을 보여줍니다';
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

            const issues = await client.listIssues(projectId);
            const states = await client.listStates(projectId);
            const stateMap = new Map(states.map((s) => [s.id, s]));

            const projects = await client.listProjects();
            const projectMap = new Map<string, PlaneProject>(projects.map((p) => [p.id, p]));

            const deferredItems = issues
                .filter((issue) => {
                    const state = stateMap.get(issue.state);
                    return state && state.name.toLowerCase().includes('deferred');
                })
                .map((issue) => {
                    const meta = PlaneClient.parseMeta(issue.description_html);
                    return {
                        name: issue.name,
                        priority: issue.priority,
                        deferCount: meta.defer_count || 0,
                        originalDate: meta.original_quest_date || '—',
                        sourceName: meta.source_project_id
                            ? (projectMap.get(meta.source_project_id)?.name || '알 수 없음')
                            : '루틴',
                    };
                });

            deferredItems.sort((a, b) => b.deferCount - a.deferCount);

            const attachments = buildDeferredAttachments(deferredItems);
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
