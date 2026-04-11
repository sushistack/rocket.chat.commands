import { IPersistence, IPersistenceRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';
import { PlaneClient } from './PlaneClient';
import { PlaneCycle, PlaneModule, PulsarMeta } from './types';

const PROGRESS_KEY = new RocketChatAssociationRecord(RocketChatAssociationModel.MISC, 'pulsar-progress');

export interface ProgressResult {
    id: string;
    name: string;
    projectId: string;
    projectName: string;
    type: 'cycle' | 'module';
    startDate: string;
    endDate: string;
    expectedCount: number;   // 분모: 기간 내 루틴이 생성해야 할 총 날짜 수
    completedCount: number;  // 분자: 루틴 프로젝트의 해당 기간 완료 이슈 수
    rate: number;            // completedCount / expectedCount (0~1)
}

/**
 * 주어진 기간 내에서 루틴이 생성해야 할 날짜 수 계산
 */
function countExpectedDays(
    meta: PulsarMeta,
    startDate: string,
    endDate: string,
): number {
    const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const start = new Date(startDate + 'T12:00:00+09:00');
    const end = new Date(endDate + 'T12:00:00+09:00');

    // 루틴 자체의 active 기간으로 범위 제한
    const activeFrom = meta.routine_active_from
        ? new Date(meta.routine_active_from + 'T12:00:00+09:00')
        : start;
    const activeUntil = meta.routine_active_until
        ? new Date(meta.routine_active_until + 'T12:00:00+09:00')
        : end;

    const effectiveStart = new Date(Math.max(start.getTime(), activeFrom.getTime()));
    const effectiveEnd = new Date(Math.min(end.getTime(), activeUntil.getTime()));

    if (effectiveStart > effectiveEnd) return 0;

    let count = 0;
    const current = new Date(effectiveStart);
    while (current <= effectiveEnd) {
        const day = dayNames[current.getUTCDay()];

        if (meta.routine_days?.length) {
            if (meta.routine_days.includes(day)) count++;
        } else {
            // no routine_days → every day
            count++;
        }

        current.setDate(current.getDate() + 1);
    }
    return count;
}

/**
 * 모든 프로젝트의 Cycle/Module에 대해 루틴 기반 진행도 계산
 */
export async function calculateProgress(
    client: PlaneClient,
    routineProjectId: string,
): Promise<ProgressResult[]> {
    const results: ProgressResult[] = [];
    const projects = await client.listProjects();

    // 루틴 프로젝트의 모든 이슈 (완료 여부 확인용)
    const routineIssues = await client.listIssues(routineProjectId);
    const routineStates = await client.listStates(routineProjectId);
    const completedStateIds = new Set(
        routineStates.filter((s) => s.group === 'completed').map((s) => s.id),
    );

    for (const project of projects) {
        if (project.id === routineProjectId) continue;

        // 해당 프로젝트의 on 루틴 이슈들
        const labels = await client.listLabels(project.id);
        const routineLabel = labels.find((l) => l.name.toLowerCase() === 'daily-routine');
        if (!routineLabel) continue;
        const onLabel = labels.find((l) => l.name.toLowerCase() === 'on');

        const issues = await client.listIssues(project.id);
        const onRoutines = issues.filter((i) => {
            const hasRoutine = i.labels.includes(routineLabel.id);
            const isOn = onLabel ? i.labels.includes(onLabel.id) : true;
            return hasRoutine && isOn;
        });

        if (onRoutines.length === 0) continue;

        // Cycles
        const cycles = await client.listCycles(project.id, 'incomplete');
        for (const cycle of cycles) {
            if (!cycle.start_date || !cycle.end_date) continue;
            const startDate = cycle.start_date.split('T')[0];
            const endDate = cycle.end_date.split('T')[0];

            const result = computeForPeriod(
                onRoutines, routineIssues, completedStateIds,
                cycle.id, cycle.name, project.id, project.name,
                'cycle', startDate, endDate,
            );
            if (result.expectedCount > 0) results.push(result);
        }

        // Modules
        const modules = await client.listModules(project.id);
        for (const mod of modules) {
            if (!mod.start_date || !mod.target_date) continue;
            const startDate = mod.start_date.split('T')[0];
            const endDate = mod.target_date.split('T')[0];

            const result = computeForPeriod(
                onRoutines, routineIssues, completedStateIds,
                mod.id, mod.name, project.id, project.name,
                'module', startDate, endDate,
            );
            if (result.expectedCount > 0) results.push(result);
        }
    }

    return results;
}

function computeForPeriod(
    onRoutines: Array<{ id: string; description_html: string }>,
    routineIssues: Array<{ id: string; state: string; description_html: string }>,
    completedStateIds: Set<string>,
    entityId: string,
    entityName: string,
    projectId: string,
    projectName: string,
    type: 'cycle' | 'module',
    startDate: string,
    endDate: string,
): ProgressResult {
    // 분모: 기간 내 루틴이 생성해야 할 총 횟수
    let expectedCount = 0;
    const sourceIssueIds = new Set<string>();

    for (const routine of onRoutines) {
        const meta = PlaneClient.parseMeta(routine.description_html);
        expectedCount += countExpectedDays(meta, startDate, endDate);
        sourceIssueIds.add(routine.id);
    }

    // 분자: 루틴 프로젝트에서 해당 소스의 완료 이슈 중 기간 내 quest_date 있는 것
    let completedCount = 0;
    for (const issue of routineIssues) {
        if (!completedStateIds.has(issue.state)) continue;
        const meta = PlaneClient.parseMeta(issue.description_html);
        if (!meta.source_issue_id || !sourceIssueIds.has(meta.source_issue_id)) continue;
        if (!meta.quest_date) continue;
        if (meta.quest_date >= startDate && meta.quest_date <= endDate) {
            completedCount++;
        }
    }

    const rate = expectedCount > 0 ? completedCount / expectedCount : 0;

    return {
        id: entityId,
        name: entityName,
        projectId,
        projectName,
        type,
        startDate,
        endDate,
        expectedCount,
        completedCount,
        rate,
    };
}

/**
 * 계산 결과를 Persistence에 저장
 */
export async function saveProgress(persis: IPersistence, results: ProgressResult[]): Promise<void> {
    await persis.updateByAssociation(PROGRESS_KEY, { results, updatedAt: new Date().toISOString() }, true);
}

/**
 * Persistence에서 저장된 진행도 읽기
 */
export async function loadProgress(persisRead: IPersistenceRead): Promise<ProgressResult[]> {
    const records = await persisRead.readByAssociation(PROGRESS_KEY);
    if (records.length === 0) return [];
    const data = records[0] as { results?: ProgressResult[] };
    return data.results || [];
}
