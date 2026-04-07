import { IRead, IHttp } from '@rocket.chat/apps-engine/definition/accessors';
import { AppSetting } from '../settings';
import { PlaneClient } from '../plane/PlaneClient';

export async function getPlaneClient(read: IRead, http: IHttp): Promise<PlaneClient> {
    const env = read.getEnvironmentReader().getSettings();
    const baseUrl = (await env.getValueById(AppSetting.PlaneBaseUrl)) as string;
    const apiKey = (await env.getValueById(AppSetting.PlaneApiKey)) as string;
    const slug = (await env.getValueById(AppSetting.PlaneWorkspaceSlug)) as string;
    if (!baseUrl || !apiKey || !slug) {
        throw new Error('Plane 설정이 완료되지 않았습니다. App Administration에서 Plane URL, API Key, Workspace Slug를 설정해주세요.');
    }
    return new PlaneClient(http, baseUrl, apiKey, slug);
}

export async function getRoutineProjectId(read: IRead): Promise<string> {
    const env = read.getEnvironmentReader().getSettings();
    const projectId = (await env.getValueById(AppSetting.RoutineProjectId)) as string;
    if (!projectId) {
        throw new Error('루틴 프로젝트 ID가 설정되지 않았습니다. App Administration에서 Routine Project ID를 설정해주세요.');
    }
    return projectId;
}
