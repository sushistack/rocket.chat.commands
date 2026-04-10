import { ISetting, SettingType } from '@rocket.chat/apps-engine/definition/settings';

export enum AppSetting {
    PlaneBaseUrl = 'plane_base_url',
    PlaneApiKey = 'plane_api_key',
    PlaneWorkspaceSlug = 'plane_workspace_slug',
    RoutineProjectId = 'routine_project_id',
    TriggerSecret = 'trigger_secret',
}

export const settings: ISetting[] = [
    {
        id: AppSetting.PlaneBaseUrl,
        type: SettingType.STRING,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'Plane Base URL',
        i18nDescription: 'Plane.so 인스턴스 URL (예: https://todo.eli.kr)',
    },
    {
        id: AppSetting.PlaneApiKey,
        type: SettingType.STRING,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'Plane API Key',
        i18nDescription: 'Plane.so API 키',
    },
    {
        id: AppSetting.PlaneWorkspaceSlug,
        type: SettingType.STRING,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'Plane Workspace Slug',
        i18nDescription: 'Plane 워크스페이스 슬러그 (예: pulse)',
    },
    {
        id: AppSetting.RoutineProjectId,
        type: SettingType.STRING,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'Routine Project ID',
        i18nDescription: '일일 퀘스트 전용 루틴 프로젝트 ID',
    },
    {
        id: AppSetting.TriggerSecret,
        type: SettingType.STRING,
        packageValue: '',
        required: true,
        public: false,
        i18nLabel: 'Trigger Secret',
        i18nDescription: 'n8n 등 외부에서 스케줄러를 트리거할 때 사용하는 시크릿 토큰',
    },
];
