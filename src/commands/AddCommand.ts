import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { ISlashCommand, SlashCommandContext } from '@rocket.chat/apps-engine/definition/slashcommands';
import { getPlaneClient, getRoutineProjectId } from './_helpers';
import { PlaneClient } from '../plane/PlaneClient';
import { PulsarMeta } from '../plane/types';
import { parseDuration, formatDuration, todayString, nowTimeString } from '../ui/formatters';

const DEFAULT_DURATION_MIN = 30;
const DURATION_PATTERN = /^(\d+h)?(\d+m)?$/;
const TIME_PATTERN = /^\d{1,2}:\d{2}$/;

export class AddCommand implements ISlashCommand {
    public command = 'add';
    public i18nParamsExample = '{name} {duration}';
    public i18nDescription = '오늘의 퀘스트에 새 태스크를 추가합니다';
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
                    .setAttachments([{ color: '#f39c12', text: '⚠️ 사용법: `/add {태스크명} {시작시간} {소요시간}`\n예: `/add 코드리뷰 14:00 1h30m`' }]);
                await modify.getCreator().finish(msg);
                return;
            }

            // Parse from the end: last token may be duration, second-to-last may be time
            let durationMin = DEFAULT_DURATION_MIN;
            let scheduledTime: string | undefined;
            let nameParts = [...args];

            // Check last token for duration (e.g. 1h30m)
            const lastToken = args[args.length - 1];
            if (args.length > 1 && DURATION_PATTERN.test(lastToken)) {
                const parsed = parseDuration(lastToken);
                if (parsed !== null) {
                    durationMin = parsed;
                    nameParts = args.slice(0, -1);
                }
            }

            // Check new last token for time (e.g. 14:00)
            const newLastToken = nameParts[nameParts.length - 1];
            if (nameParts.length > 1 && TIME_PATTERN.test(newLastToken)) {
                scheduledTime = newLastToken;
                nameParts = nameParts.slice(0, -1);
            }

            // Default to current time if not specified
            if (!scheduledTime) {
                scheduledTime = nowTimeString();
            }

            const name = nameParts.join(' ');
            const today = todayString();

            const client = await getPlaneClient(read, http);
            const projectId = await getRoutineProjectId(read);

            // Find first unstarted state
            const unstartedState = await client.findStateByGroup(projectId, 'unstarted');
            if (!unstartedState) {
                const msg = modify.getCreator().startMessage()
                    .setRoom(context.getRoom())
                    .setAttachments([{ color: '#e74c3c', text: '❌ unstarted 상태를 찾을 수 없습니다.' }]);
                await modify.getCreator().finish(msg);
                return;
            }

            // Build meta
            const meta: PulsarMeta = {
                quest_date: today,
                scheduled_time: scheduledTime,
                adjusted_duration_min: durationMin,
                generation_source: 'user_created',
            };
            const descriptionHtml = PlaneClient.setMeta('', meta);

            // Create issue
            await client.createIssue(projectId, {
                name,
                state: unstartedState.id,
                target_date: today,
                priority: 'medium',
                description_html: descriptionHtml,
            });

            const durationDisplay = formatDuration(durationMin);
            const timeDisplay = scheduledTime ? ` ${scheduledTime}` : '';
            const msg = modify.getCreator().startMessage()
                .setRoom(context.getRoom())
                .setAttachments([{ color: '#2ecc71', text: `✅ '${name}'${timeDisplay} (${durationDisplay}) 추가 완료!` }]);
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
