import { ApiEndpoint } from '@rocket.chat/apps-engine/definition/api/ApiEndpoint';
import { IApiEndpointInfo } from '@rocket.chat/apps-engine/definition/api/IApiEndpointInfo';
import { IApiRequest } from '@rocket.chat/apps-engine/definition/api/IRequest';
import { IApiResponse } from '@rocket.chat/apps-engine/definition/api/IResponse';
import { IHttp, IModify, IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { AppSetting } from '../settings';

const VALID_JOBS = new Set([
    'daily-quest-generator',
    'daily-summary-reporter',
    'deferred-cleanup',
]);

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
        const secret = await read.getEnvironmentReader().getSettings().getValueById(AppSetting.TriggerSecret);
        const token = request.headers['x-trigger-secret'] || request.query?.secret;
        if (!secret || token !== secret) {
            return this.json({
                status: 401 as any,
                content: { success: false, error: 'Unauthorized' },
            });
        }

        const jobId = request.query?.job || request.content?.job;

        if (!jobId || !VALID_JOBS.has(jobId)) {
            return this.json({
                status: 400 as any,
                content: {
                    success: false,
                    error: `Invalid job. Available: ${[...VALID_JOBS].join(', ')}`,
                },
            });
        }

        // Queue via Apps-Engine scheduler — returns immediately, no 30s timeout risk
        await modify.getScheduler().scheduleOnce({ id: jobId, when: new Date() });

        return this.json({
            status: 200 as any,
            content: { success: true, job: jobId, queued: true },
        });
    }
}
