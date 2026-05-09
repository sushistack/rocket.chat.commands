import { ApiEndpoint } from '@rocket.chat/apps-engine/definition/api/ApiEndpoint';
import { IApiEndpointInfo } from '@rocket.chat/apps-engine/definition/api/IApiEndpointInfo';
import { IApiRequest } from '@rocket.chat/apps-engine/definition/api/IRequest';
import { IApiResponse } from '@rocket.chat/apps-engine/definition/api/IResponse';
import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { AppSetting } from '../settings';
import { DailyQuestGenerator } from '../schedulers/DailyQuestGenerator';
import { DailySummaryReporter } from '../schedulers/DailySummaryReporter';
import { DeferredCleanup } from '../schedulers/DeferredCleanup';

const processors: Record<string, { new(): any }> = {
    'daily-quest-generator': DailyQuestGenerator,
    'daily-summary-reporter': DailySummaryReporter,
    'deferred-cleanup': DeferredCleanup,
};

export class SchedulerTriggerEndpoint extends ApiEndpoint {
    public path = 'trigger';

    public async post(
        request: IApiRequest,
        endpoint: IApiEndpointInfo,
        read: IRead,
        modify: IModify,
        http: IHttp,
        persis: IPersistence,
    ): Promise<IApiResponse> {
        // Verify trigger secret
        const secret = await read.getEnvironmentReader().getSettings().getValueById(AppSetting.TriggerSecret);
        const token = request.headers['x-trigger-secret'] || request.query?.secret;
        if (!secret || token !== secret) {
            return this.json({
                status: 401 as any,
                content: { success: false, error: 'Unauthorized' },
            });
        }

        const jobId = request.query?.job || request.content?.job;

        if (!jobId || !processors[jobId]) {
            return this.json({
                status: 400 as any,
                content: {
                    success: false,
                    error: `Invalid job. Available: ${Object.keys(processors).join(', ')}`,
                },
            });
        }

        const ProcessorClass = processors[jobId];
        const processor = new ProcessorClass();
        processor.processor({}, read, modify, http, persis).catch(async (error: any) => {
            try {
                const room = await read.getRoomReader().getByName('pulse');
                if (!room) return;
                const msg = modify.getCreator().startMessage()
                    .setRoom(room)
                    .setAttachments([{
                        color: '#e74c3c',
                        text: `❌ 스케줄러 실패: \`${jobId}\``,
                        fields: [{ title: 'Error', value: error?.message || String(error), short: false }],
                    }]);
                await modify.getCreator().finish(msg);
            } catch {
                // notification failed — nothing more to do
            }
        });

        return this.json({
            status: 200 as any,
            content: { success: true, job: jobId, async: true },
        });
    }
}
