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
import { priorityEmoji } from '../ui/formatters';

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

            // Load all projects for source project name lookup
            const projects = await client.listProjects();
            const projectMap = new Map<string, PlaneProject>(projects.map((p) => [p.id, p]));

            // Filter issues whose state name contains 'Deferred' (case-insensitive)
            const deferredItems = issues
                .filter((issue) => {
                    const state = stateMap.get(issue.state);
                    return state && state.name.toLowerCase().includes('deferred');
                })
                .map((issue) => ({
                    issue,
                    state: stateMap.get(issue.state)!,
                    meta: PlaneClient.parseMeta(issue.description_html),
                }));

            // Sort by defer_count descending
            deferredItems.sort((a, b) => (b.meta.defer_count || 0) - (a.meta.defer_count || 0));

            let text = '';
            text += `┌─────────────────────┐\n`;
            text += `│  ⏸️  연기된 퀘스트 (${deferredItems.length}개)\n`;
            text += `└─────────────────────┘\n`;

            if (deferredItems.length === 0) {
                const hasDeferredState = states.some((s) => s.name.toLowerCase().includes('deferred'));
                if (!hasDeferredState) {
                    text += '\n⚠️ Plane 프로젝트에 "Deferred" 상태가 없습니다.\n프로젝트 설정에서 추가해주세요.';
                } else {
                    text += '\n🎉 연기된 퀘스트가 없습니다!';
                }
            } else {
                for (let i = 0; i < deferredItems.length; i++) {
                    const { issue, meta } = deferredItems[i];
                    const emoji = priorityEmoji(issue.priority);
                    const deferCount = meta.defer_count || 0;
                    const originalDate = meta.original_quest_date || '—';
                    const sourceProjectName = meta.source_project_id
                        ? (projectMap.get(meta.source_project_id)?.name || '알 수 없음')
                        : '루틴';
                    const warn = deferCount >= 5 ? ' 🔥' : deferCount >= 3 ? ' ⚠️' : '';

                    text += `\n  ${i + 1}. [${emoji}] ${issue.name}${warn}`;
                    text += `\n     📅 ${originalDate}  🔄 ${deferCount}회 연기  📂 ${sourceProjectName}`;
                }

                text += '\n\n💡 `/restore` 명령어로 복원할 수 있어요.';
            }

            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setText(text);
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
