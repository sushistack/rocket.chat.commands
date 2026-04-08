import { PulsarMeta, PlaneIssue, PlaneState } from '../plane/types';

const PRIORITY_EMOJI: Record<string, string> = {
    urgent: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
    none: '⚪',
};

const STATE_GROUP_EMOJI: Record<string, string> = {
    unstarted: '📝',
    started: '🔄',
    completed: '✅',
    cancelled: '❌',
    backlog: '📦',
};

const STATE_GROUP_LABEL: Record<string, string> = {
    unstarted: 'To-Do',
    started: 'In Progress',
    completed: 'Done',
    cancelled: 'Canceled',
    backlog: 'Backlog',
};

export function priorityEmoji(priority: string): string {
    return PRIORITY_EMOJI[priority] || '⚪';
}

export function stateGroupEmoji(group: string): string {
    return STATE_GROUP_EMOJI[group] || '📋';
}

export function stateGroupLabel(group: string): string {
    return STATE_GROUP_LABEL[group] || group;
}

export function progressBar(ratio: number, width: number = 10): string {
    const clamped = Math.max(0, Math.min(1, ratio));
    const filled = Math.round(clamped * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function parseDuration(input: string): number | null {
    const match = input.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
    if (!match) return null;
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const total = hours * 60 + minutes;
    return total > 0 ? total : null;
}

export function formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatTime(time: string | undefined): string {
    return time || '--:--';
}

export function todayString(): string {
    const now = new Date();
    const offset = 9 * 60; // KST = UTC+9
    const kst = new Date(now.getTime() + offset * 60 * 1000);
    return kst.toISOString().split('T')[0];
}

export function nowTimeString(): string {
    const now = new Date();
    const offset = 9 * 60;
    const kst = new Date(now.getTime() + offset * 60 * 1000);
    return kst.toISOString().split('T')[1].substring(0, 5);
}

export function dayOfWeek(dateStr: string): string {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const d = new Date(dateStr + 'T12:00:00+09:00');
    return days[d.getUTCDay()];
}

export function dDay(targetDate: string): string {
    const today = new Date(todayString() + 'T00:00:00+09:00');
    const dateOnly = targetDate.includes('T') ? targetDate.split('T')[0] : targetDate;
    const target = new Date(dateOnly + 'T00:00:00+09:00');
    const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'D-Day';
    if (diff > 0) return `D-${diff}`;
    return `D+${Math.abs(diff)}`;
}

export interface IssueDisplayItem {
    issue: PlaneIssue;
    state: PlaneState;
    meta: PulsarMeta;
}

export function formatIssueOneLiner(item: IssueDisplayItem, index: number): string {
    const p = priorityEmoji(item.issue.priority);
    const parts = [`${index}. [${p}] ${item.issue.name}`];
    if (item.meta.scheduled_time) parts.push(`— ${item.meta.scheduled_time}`);
    if (item.meta.adjusted_duration_min) parts.push(`(${item.meta.adjusted_duration_min}분)`);
    if (item.meta.defer_count && item.meta.defer_count > 0) parts.push(`(${item.meta.defer_count}회 연기)`);
    if (item.state.group === 'completed') parts.push('✓');
    return parts.join(' ');
}

export function formatTodaySummary(items: IssueDisplayItem[]): string {
    const today = todayString();
    const dow = dayOfWeek(today);
    const total = items.length;
    const done = items.filter((i) => i.state.group === 'completed').length;
    const deferred = items.filter((i) => i.state.name.toLowerCase().includes('deferred')).length;
    const cancelled = items.filter((i) => i.state.group === 'cancelled').length;
    const todo = items.filter((i) => (i.state.group === 'unstarted' || i.state.group === 'backlog') && !i.state.name.toLowerCase().includes('deferred')).length;
    const remaining = items
        .filter((i) => i.state.group !== 'completed' && i.state.group !== 'cancelled')
        .reduce((sum, i) => sum + (i.meta.adjusted_duration_min || 0), 0);
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    const bar = progressBar(rate / 100, 15);

    let text = '';
    text += `┌────────────────────┐\n`;
    text += `│  📋  ${today} (${dow}) 오늘의 퀘스트\n`;
    text += `├────────────────────┤\n`;
    text += `│  ${bar} ${rate}%\n`;
    text += `│\n`;
    text += `│  All: ${total}  ✅ Done: ${done}  📝 To-Do: ${todo}\n`;
    text += `│  ⏸️ Deferred: ${deferred}  ❌ Canceled: ${cancelled}\n`;
    text += `│\n`;
    text += `│  ⏱️ 남은 시간: ${formatDuration(remaining)}\n`;
    text += `└────────────────────┘\n`;
    return text;
}

export function groupIssuesByState(items: IssueDisplayItem[]): Map<string, IssueDisplayItem[]> {
    const groups = new Map<string, IssueDisplayItem[]>();
    const order = ['unstarted', 'started', 'completed', 'cancelled', 'backlog'];
    for (const g of order) {
        groups.set(g, []);
    }
    for (const item of items) {
        const group = item.state.group;
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group)!.push(item);
    }
    return groups;
}
