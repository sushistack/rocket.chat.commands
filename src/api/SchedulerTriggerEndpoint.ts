import { ApiEndpoint } from '@rocket.chat/apps-engine/definition/api/ApiEndpoint';
import { IApiEndpointInfo } from '@rocket.chat/apps-engine/definition/api/IApiEndpointInfo';
import { IApiRequest } from '@rocket.chat/apps-engine/definition/api/IRequest';
import { IApiResponse } from '@rocket.chat/apps-engine/definition/api/IResponse';
import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
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

        try {
            const ProcessorClass = processors[jobId];
            const processor = new ProcessorClass();
            await processor.processor({}, read, modify, http, persis);

            return this.json({
                status: 200 as any,
                content: { success: true, job: jobId },
            });
        } catch (error: any) {
            return this.json({
                status: 500 as any,
                content: {
                    success: false,
                    job: jobId,
                    error: error.message || String(error),
                },
            });
        }
    }
}
