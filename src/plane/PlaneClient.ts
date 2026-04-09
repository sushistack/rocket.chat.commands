import { IHttp, IHttpRequest } from '@rocket.chat/apps-engine/definition/accessors';
import {
    PulsarMeta,
    PaginatedResponse,
    PlaneComment,
    PlaneCycle,
    PlaneIssue,
    PlaneLabel,
    PlaneModule,
    PlaneProject,
    PlaneState,
} from './types';

const META_PREFIX = 'DFMETA:';
// Legacy format: <details><summary>meta</summary><code>DFMETA:{...}</code></details>
const META_REGEX = /<details><summary>meta<\/summary><code>DFMETA:(.*?)<\/code><\/details>/;
// New format: <pre><code>DFMETA:{...}</code></pre>
const META_PRE_REGEX = /<pre><code[^>]*>DFMETA:([\s\S]*?)<\/code><\/pre>/;

const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PlaneClient {
    constructor(
        private readonly http: IHttp,
        private readonly baseUrl: string,
        private readonly apiKey: string,
        private readonly workspaceSlug: string,
    ) {}

    // ─── Helpers ───

    private get headers(): Record<string, string> {
        return {
            'x-api-key': this.apiKey,
            'Content-Type': 'application/json',
        };
    }

    private url(path: string): string {
        return `${this.baseUrl}/api/v1/workspaces/${this.workspaceSlug}${path}`;
    }

    private async handleRateLimit(res: { statusCode: number; headers?: Record<string, string> }, path: string, attempt: number): Promise<void> {
        if (res.statusCode === 429 && attempt < MAX_RETRIES) {
            let waitSec = parseInt(res.headers?.['retry-after'] || '0', 10);
            if (!waitSec || waitSec <= 0) {
                // Fallback: try X-RateLimit-Reset (unix timestamp)
                const resetTs = parseInt(res.headers?.['x-ratelimit-reset'] || '0', 10);
                if (resetTs > 0) {
                    waitSec = Math.max(1, Math.ceil(resetTs - Date.now() / 1000));
                } else {
                    waitSec = 2;
                }
            }
            waitSec = Math.min(waitSec, 60);
            await sleep(waitSec * 1000);
            return;
        }
        if (res.statusCode === 429) {
            throw new Error(`Plane API rate limit exceeded after ${MAX_RETRIES} retries (${path})`);
        }
    }

    private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const options: IHttpRequest = { headers: this.headers, params };
            const res = await this.http.get(this.url(path), options);
            if (res.statusCode === 429) {
                await this.handleRateLimit(res, path, attempt);
                continue;
            }
            if (!res.statusCode || res.statusCode >= 400) {
                throw new Error(`Plane API error ${res.statusCode} (${path}): ${(res.content || '').substring(0, 200)}`);
            }
            return JSON.parse(res.content || '{}') as T;
        }
        throw new Error(`Plane API rate limit exceeded after ${MAX_RETRIES} retries (${path})`);
    }

    private async post<T>(path: string, data: any): Promise<T> {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const options: IHttpRequest = { headers: this.headers, data };
            const res = await this.http.post(this.url(path), options);
            if (res.statusCode === 429) {
                await this.handleRateLimit(res, path, attempt);
                continue;
            }
            if (!res.statusCode || res.statusCode >= 400) {
                throw new Error(`Plane API error ${res.statusCode} (${path}): ${(res.content || '').substring(0, 200)}`);
            }
            return JSON.parse(res.content || '{}') as T;
        }
        throw new Error(`Plane API rate limit exceeded after ${MAX_RETRIES} retries (${path})`);
    }

    private async patch<T>(path: string, data: any): Promise<T> {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const options: IHttpRequest = { headers: this.headers, data };
            const res = await this.http.patch(this.url(path), options);
            if (res.statusCode === 429) {
                await this.handleRateLimit(res, path, attempt);
                continue;
            }
            if (!res.statusCode || res.statusCode >= 400) {
                throw new Error(`Plane API error ${res.statusCode} (${path}): ${(res.content || '').substring(0, 200)}`);
            }
            return JSON.parse(res.content || '{}') as T;
        }
        throw new Error(`Plane API rate limit exceeded after ${MAX_RETRIES} retries (${path})`);
    }

    private async del(path: string): Promise<void> {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            const options: IHttpRequest = { headers: this.headers };
            const res = await this.http.del(this.url(path), options);
            if (res.statusCode === 429) {
                await this.handleRateLimit(res, path, attempt);
                continue;
            }
            if (!res.statusCode || res.statusCode >= 400) {
                throw new Error(`Plane API error ${res.statusCode} (${path}): ${(res.content || '').substring(0, 200)}`);
            }
            return;
        }
        throw new Error(`Plane API rate limit exceeded after ${MAX_RETRIES} retries (${path})`);
    }

    private async getAllPages<T>(path: string, params?: Record<string, string>, maxPages: number = 50): Promise<T[]> {
        const all: T[] = [];
        let cursor: string | undefined;
        let pages = 0;
        do {
            const p = { per_page: '100', ...params, ...(cursor ? { cursor } : {}) };
            const page = await this.get<PaginatedResponse<T>>(path, p);
            all.push(...page.results);
            cursor = page.next_page_results ? page.next_cursor : undefined;
            pages++;
            if (pages >= maxPages) break;
        } while (cursor);
        return all;
    }

    // ─── Projects ───

    async listProjects(): Promise<PlaneProject[]> {
        return this.getAllPages<PlaneProject>('/projects/');
    }

    // ─── States ───

    async listStates(projectId: string): Promise<PlaneState[]> {
        return this.getAllPages<PlaneState>(`/projects/${projectId}/states/`);
    }

    async findStateByGroup(projectId: string, group: PlaneState['group'], name?: string): Promise<PlaneState | undefined> {
        const states = await this.listStates(projectId);
        if (name) {
            return states.find((s) => s.group === group && s.name.toLowerCase() === name.toLowerCase());
        }
        return states.find((s) => s.group === group);
    }

    // ─── Labels ───

    async listLabels(projectId: string): Promise<PlaneLabel[]> {
        return this.getAllPages<PlaneLabel>(`/projects/${projectId}/labels/`);
    }

    async addLabelToIssue(projectId: string, issueId: string, labelId: string): Promise<PlaneIssue> {
        const issue = await this.getIssue(projectId, issueId);
        const labels = [...new Set([...issue.labels, labelId])];
        return this.updateIssue(projectId, issueId, { labels } as any);
    }

    async removeLabelFromIssue(projectId: string, issueId: string, labelId: string): Promise<PlaneIssue> {
        const issue = await this.getIssue(projectId, issueId);
        const labels = issue.labels.filter((l) => l !== labelId);
        return this.updateIssue(projectId, issueId, { labels } as any);
    }

    // ─── Issues ───

    async listIssues(projectId: string, params?: Record<string, string>): Promise<PlaneIssue[]> {
        return this.getAllPages<PlaneIssue>(`/projects/${projectId}/issues/`, params);
    }

    async getIssue(projectId: string, issueId: string): Promise<PlaneIssue> {
        return this.get<PlaneIssue>(`/projects/${projectId}/issues/${issueId}/`);
    }

    async createIssue(projectId: string, data: Partial<PlaneIssue>): Promise<PlaneIssue> {
        return this.post<PlaneIssue>(`/projects/${projectId}/issues/`, data);
    }

    async updateIssue(projectId: string, issueId: string, data: Partial<PlaneIssue>): Promise<PlaneIssue> {
        return this.patch<PlaneIssue>(`/projects/${projectId}/issues/${issueId}/`, data);
    }

    async deleteIssue(projectId: string, issueId: string): Promise<void> {
        return this.del(`/projects/${projectId}/issues/${issueId}/`);
    }

    // ─── Comments ───

    async listComments(projectId: string, issueId: string): Promise<PlaneComment[]> {
        return this.getAllPages<PlaneComment>(`/projects/${projectId}/issues/${issueId}/comments/`);
    }

    async createComment(projectId: string, issueId: string, html: string): Promise<PlaneComment> {
        return this.post<PlaneComment>(`/projects/${projectId}/issues/${issueId}/comments/`, {
            comment_html: html,
        });
    }

    // ─── Cycles (Milestones) ───

    async listCycles(projectId: string, view?: string): Promise<PlaneCycle[]> {
        const params = view ? { cycle_view: view } : undefined;
        return this.getAllPages<PlaneCycle>(`/projects/${projectId}/cycles/`, params);
    }

    async listCycleIssues(projectId: string, cycleId: string): Promise<PlaneIssue[]> {
        return this.getAllPages<PlaneIssue>(`/projects/${projectId}/cycles/${cycleId}/cycle-issues/`);
    }

    // ─── Modules ───

    async listModules(projectId: string): Promise<PlaneModule[]> {
        return this.getAllPages<PlaneModule>(`/projects/${projectId}/modules/`);
    }

    async listModuleIssues(projectId: string, moduleId: string): Promise<PlaneIssue[]> {
        return this.getAllPages<PlaneIssue>(`/projects/${projectId}/modules/${moduleId}/module-issues/`);
    }

    // ─── Date helpers ───

    static todayKST(): string {
        const now = new Date();
        const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        return kst.toISOString().split('T')[0];
    }

    // ─── Pulsar Meta (embedded in description_html) ───

    static parseMeta(descriptionHtml: string | undefined | null): PulsarMeta {
        if (!descriptionHtml) return {};

        // Primary: new <pre><code>DFMETA:{...}</code></pre> format
        const preMatch = descriptionHtml.match(META_PRE_REGEX);
        if (preMatch) {
            try {
                return JSON.parse(preMatch[1]);
            } catch { /* fall through */ }
        }

        // Legacy: <details><summary>meta</summary><code>DFMETA:{...}</code></details>
        const match = descriptionHtml.match(META_REGEX);
        if (match) {
            try {
                return JSON.parse(match[1]);
            } catch { /* fall through */ }
        }

        // Fallback: JSON in <code> block (manual metadata format)
        const codeMatch = descriptionHtml.match(/<code[^>]*>\s*(\{[\s\S]*?\})\s*<\/code>/);
        if (codeMatch) {
            try {
                return JSON.parse(codeMatch[1]);
            } catch { /* fall through */ }
        }

        // Fallback: raw JSON block anywhere in HTML
        const jsonMatch = descriptionHtml.match(/\{[^{}]*"routine_type"[^{}]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch { /* fall through */ }
        }

        return {};
    }

    static setMeta(descriptionHtml: string | undefined | null, meta: PulsarMeta): string {
        const json = JSON.stringify(meta, null, 2);
        const metaTag = `<pre><code class="language-json">${META_PREFIX}${json}</code></pre>`;
        const base = descriptionHtml || '';

        // Remove existing meta blocks (both legacy and new format)
        const cleaned = base
            .replace(META_REGEX, '')
            .replace(/<details><summary>meta<\/summary><code>DFMETA:.*?<\/code><\/details>/g, '')
            .replace(META_PRE_REGEX, '')
            .replace(/<pre><code[^>]*>DFMETA:[\s\S]*?<\/code><\/pre>/g, '');

        const safeBase = cleaned.trim() || '<p></p>';
        return `${safeBase}\n${metaTag}`;
    }

    // ─── Convenience: filter issues by today ───

    async getTodayIssues(projectId: string, states: PlaneState[]): Promise<{
        items: { issue: PlaneIssue; state: PlaneState; meta: PulsarMeta }[];
        globalCounts: { deferred: number; cancelled: number };
    }> {
        const today = PlaneClient.todayKST();
        const issues = await this.listIssues(projectId);
        const stateMap = new Map(states.map((s) => [s.id, s]));

        let globalDeferred = 0;
        let globalCancelled = 0;
        for (const issue of issues) {
            const state = stateMap.get(issue.state);
            if (!state) continue;
            if (state.name.toLowerCase().includes('deferred')) globalDeferred++;
            else if (state.group === 'cancelled') globalCancelled++;
        }

        const items = issues
            .filter((i) => {
                const meta = PlaneClient.parseMeta(i.description_html);
                return i.target_date === today || meta.quest_date === today;
            })
            .map((issue) => ({
                issue,
                state: stateMap.get(issue.state)!,
                meta: PlaneClient.parseMeta(issue.description_html),
            }))
            .filter((item) => item.state);

        return { items, globalCounts: { deferred: globalDeferred, cancelled: globalCancelled } };
    }

    async getIssuesByStateGroup(projectId: string, group: PlaneState['group']): Promise<{ issue: PlaneIssue; state: PlaneState; meta: PulsarMeta }[]> {
        const states = await this.listStates(projectId);
        const groupStates = states.filter((s) => s.group === group);
        const groupStateIds = new Set(groupStates.map((s) => s.id));
        const issues = await this.listIssues(projectId);
        const stateMap = new Map(states.map((s) => [s.id, s]));

        return issues
            .filter((i) => groupStateIds.has(i.state))
            .map((issue) => ({
                issue,
                state: stateMap.get(issue.state)!,
                meta: PlaneClient.parseMeta(issue.description_html),
            }));
    }
}
