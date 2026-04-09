import { BlockBuilder, BlockElementType, TextObjectType } from '@rocket.chat/apps-engine/definition/uikit';
import { IMessageAttachment, IMessageAttachmentField } from '@rocket.chat/apps-engine/definition/messages';
import {
    IssueDisplayItem,
    priorityEmoji,
    stateGroupEmoji,
    formatTime,
    formatDuration,
    progressBar,
    todayString,
    dayOfWeek,
    groupIssuesByState,
    formatIssueOneLiner,
} from './formatters';

export function buildIssueButtonList(
    block: BlockBuilder,
    items: IssueDisplayItem[],
    actionPrefix: string,
    header?: string,
): void {
    // Sort by scheduled_time
    const sorted = [...items].sort((a, b) =>
        (a.meta.scheduled_time || '99:99').localeCompare(b.meta.scheduled_time || '99:99'),
    );
    if (header) {
        block.addSectionBlock({
            text: block.newMarkdownTextObject(header),
        });
        block.addDividerBlock();
    }
    for (let i = 0; i < sorted.length; i++) {
        const item = sorted[i];
        const p = priorityEmoji(item.issue.priority);
        const time = item.meta.scheduled_time;
        const dur = item.meta.adjusted_duration_min;
        const parts = [p, item.issue.name];
        if (time) parts.push(`${time}`);
        if (dur) parts.push(`(${dur}분)`);
        const label = parts.join(' ');
        const truncated = label.length > 75 ? label.substring(0, 72) + '...' : label;

        block.addActionsBlock({
            blockId: `${actionPrefix}_block_${i}`,
            elements: [
                block.newButtonElement({
                    actionId: `${actionPrefix}_${item.issue.id}`,
                    text: block.newPlainTextObject(truncated),
                    value: item.issue.id,
                }),
            ],
        });
    }
}

export function buildTodaySummaryBlocks(
    block: BlockBuilder,
    items: IssueDisplayItem[],
    globalCounts?: { deferred: number; cancelled: number },
): void {
    const today = todayString();
    const dow = dayOfWeek(today);
    const total = items.length;
    const done = items.filter((i) => i.state.group === 'completed').length;
    const todo = items.filter((i) =>
        (i.state.group === 'unstarted' || i.state.group === 'backlog') && !i.state.name.toLowerCase().includes('deferred'),
    ).length;
    const remaining = items
        .filter((i) => i.state.group !== 'completed' && i.state.group !== 'cancelled')
        .reduce((sum, i) => sum + (i.meta.adjusted_duration_min || 0), 0);
    const deferred = globalCounts?.deferred
        ?? items.filter((i) => i.state.name.toLowerCase().includes('deferred')).length;
    const cancelled = globalCounts?.cancelled
        ?? items.filter((i) => i.state.group === 'cancelled').length;
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    const bar = progressBar(rate / 100, 15);

    // Header section
    block.addSectionBlock({
        text: block.newMarkdownTextObject(`📋  *${today} (${dow}) 오늘의 퀘스트*`),
    });

    // Progress bar
    block.addContextBlock({
        elements: [
            block.newMarkdownTextObject(`${bar}  *${rate}%*`),
        ],
    });

    block.addDividerBlock();

    // Stats
    block.addSectionBlock({
        text: block.newMarkdownTextObject(
            `📋 All: *${total}*  📝 To-Do: *${todo}*\n` +
            `✅ Done: *${done}*  ⏱️ Remaining: *${formatDuration(remaining)}*\n` +
            `⏸️ Deferred: *${deferred}*  ❌ Canceled: *${cancelled}*`,
        ),
    });

    block.addDividerBlock();

    // Issue list by group
    const deferredItems = items.filter((i) => i.state.name.toLowerCase().includes('deferred'));
    const nonDeferredItems = items.filter((i) => !i.state.name.toLowerCase().includes('deferred'));
    const grouped = groupIssuesByState(nonDeferredItems);

    const groupOrder = [
        { key: 'unstarted', emoji: '📝', label: 'To-Do' },
        { key: 'backlog', emoji: '📦', label: 'Backlog' },
        { key: 'started', emoji: '🔄', label: 'In Progress' },
        { key: 'completed', emoji: '✅', label: 'Done' },
        { key: 'cancelled', emoji: '❌', label: 'Canceled' },
    ];

    let idx = 1;
    for (const { key, emoji, label } of groupOrder) {
        const groupItems = grouped.get(key) || [];
        if (groupItems.length === 0) continue;

        block.addContextBlock({
            elements: [
                block.newMarkdownTextObject(`${emoji} *${label}*`),
            ],
        });

        const lines = groupItems.map((item) => formatIssueOneLiner(item, idx++)).join('\n');
        block.addSectionBlock({
            text: block.newMarkdownTextObject(lines),
        });
    }

    if (deferredItems.length > 0) {
        block.addContextBlock({
            elements: [
                block.newMarkdownTextObject(`⏸️ *Deferred*`),
            ],
        });
        const lines = deferredItems.map((item) => formatIssueOneLiner(item, idx++)).join('\n');
        block.addSectionBlock({
            text: block.newMarkdownTextObject(lines),
        });
    }

    if (items.length === 0) {
        block.addSectionBlock({
            text: block.newMarkdownTextObject('🎉 오늘 등록된 퀘스트가 없습니다.'),
        });
    }
}

export function buildTodaySummaryAttachments(
    items: IssueDisplayItem[],
    globalCounts?: { deferred: number; cancelled: number },
): IMessageAttachment[] {
    const today = todayString();
    const dow = dayOfWeek(today);
    const total = items.length;
    const done = items.filter((i) => i.state.group === 'completed').length;
    const todo = items.filter((i) =>
        (i.state.group === 'unstarted' || i.state.group === 'backlog') && !i.state.name.toLowerCase().includes('deferred'),
    ).length;
    const remaining = items
        .filter((i) => i.state.group !== 'completed' && i.state.group !== 'cancelled')
        .reduce((sum, i) => sum + (i.meta.adjusted_duration_min || 0), 0);
    const deferred = globalCounts?.deferred
        ?? items.filter((i) => i.state.name.toLowerCase().includes('deferred')).length;
    const cancelled = globalCounts?.cancelled
        ?? items.filter((i) => i.state.group === 'cancelled').length;
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    const bar = progressBar(rate / 100, 15);

    // Pick color based on progress
    const color = rate >= 80 ? '#2ecc71' : rate >= 40 ? '#f39c12' : '#3498db';

    const attachments: IMessageAttachment[] = [];

    // Summary card
    attachments.push({
        color,
        text: `📋 ${today} (${dow}) 오늘의 퀘스트\n${bar}  **${rate}%**`,
        fields: [
            { title: '📋 All', value: `${total}`, short: true },
            { title: '📝 To-Do', value: `${todo}`, short: true },
            { title: '✅ Done', value: `${done}`, short: true },
            { title: '⏱️ Remaining', value: formatDuration(remaining), short: true },
            { title: '⏸️ Deferred', value: `${deferred}`, short: true },
            { title: '❌ Canceled', value: `${cancelled}`, short: true },
        ],
    });

    if (items.length === 0) {
        attachments.push({
            color: '#2ecc71',
            text: '🎉 오늘 등록된 퀘스트가 없습니다.',
        });
        return attachments;
    }

    // Issue list cards by group
    const deferredItems = items.filter((i) => i.state.name.toLowerCase().includes('deferred'));
    const nonDeferredItems = items.filter((i) => !i.state.name.toLowerCase().includes('deferred'));
    const grouped = groupIssuesByState(nonDeferredItems);

    const groupConfig = [
        { key: 'unstarted', emoji: '📝', label: 'To-Do', color: '#3498db' },
        { key: 'backlog', emoji: '📦', label: 'Backlog', color: '#95a5a6' },
        { key: 'started', emoji: '🔄', label: 'In Progress', color: '#f39c12' },
        { key: 'completed', emoji: '✅', label: 'Done', color: '#2ecc71' },
        { key: 'cancelled', emoji: '❌', label: 'Canceled', color: '#e74c3c' },
    ];

    const sortByTime = (a: IssueDisplayItem, b: IssueDisplayItem) =>
        (a.meta.scheduled_time || '99:99').localeCompare(b.meta.scheduled_time || '99:99');

    let idx = 1;
    for (const { key, emoji, label, color: groupColor } of groupConfig) {
        const groupItems = (grouped.get(key) || []).sort(sortByTime);
        if (groupItems.length === 0) continue;

        const lines = groupItems.map((item) => formatIssueOneLiner(item, idx++)).join('\n');
        attachments.push({
            color: groupColor,
            text: `${emoji} ${label}\n${lines}`,
        });
    }

    if (deferredItems.length > 0) {
        deferredItems.sort(sortByTime);
        const lines = deferredItems.map((item) => formatIssueOneLiner(item, idx++)).join('\n');
        attachments.push({
            color: '#9b59b6',
            text: `⏸️ Deferred\n${lines}`,
        });
    }

    return attachments;
}

// ─── Simple response attachment (one-liner results) ───

export function buildResultAttachment(
    text: string,
    color: string = '#3498db',
): IMessageAttachment {
    return { color, text };
}

export function buildErrorAttachment(text: string): IMessageAttachment {
    return { color: '#e74c3c', text: `❌ ${text}` };
}

export function buildSuccessAttachment(text: string): IMessageAttachment {
    return { color: '#2ecc71', text: `✅ ${text}` };
}

// ─── Brief (milestone) attachments ───

export function buildBriefAttachments(
    cycles: Array<{ name: string; projectName: string; dDayStr: string; dateStr: string; pct: number; completed: number; total: number; type?: string }>,
    label: string,
): IMessageAttachment[] {
    const attachments: IMessageAttachment[] = [];

    if (cycles.length === 0) {
        attachments.push({
            color: '#95a5a6',
            text: `🎯 마일스톤 브리핑 (${label})\n📭 진행 중인 마일스톤이 없습니다.`,
        });
        return attachments;
    }

    // Header card
    attachments.push({
        color: '#9b59b6',
        text: `🎯 마일스톤 브리핑 (${label})`,
    });

    // Each cycle/module as its own card
    for (const c of cycles) {
        const typeTag = c.type === 'module' ? '📦' : '🔄';
        const color = c.pct >= 80 ? '#2ecc71' : c.pct >= 40 ? '#f39c12' : '#3498db';

        attachments.push({
            color,
            text: `${typeTag} [${c.projectName}] ${c.name}\n${progressBar(c.pct / 100, 20)}  **${c.pct}%**`,
            fields: [
                { title: '📅 D-Day', value: c.dDayStr, short: true },
                { title: '📆 Due', value: c.dateStr, short: true },
                { title: '✅ Done', value: `${c.completed}`, short: true },
                { title: '📊 Total', value: `${c.total}`, short: true },
            ],
        });
    }

    return attachments;
}

// ─── Stats attachments ───

export function buildStatsAttachments(
    days: number,
    dailyLines: string[],
    avgRate: number,
    streak: number,
    topDeferred: Array<[string, number]>,
    topCompleted: Array<[string, number]>,
): IMessageAttachment[] {
    const attachments: IMessageAttachment[] = [];

    // Daily breakdown
    attachments.push({
        color: '#3498db',
        text: `📊 루틴 통계 (최근 ${days}일)\n${dailyLines.join('\n')}`,
    });

    // Aggregate
    const fields: IMessageAttachmentField[] = [
        { title: '📈 평균 완료율', value: `${avgRate}%`, short: true },
        { title: '🔥 연속 80%+', value: `${streak}일`, short: true },
    ];
    attachments.push({
        color: '#f39c12',
        text: '📈 종합',
        fields,
    });

    if (topDeferred.length > 0) {
        attachments.push({
            color: '#9b59b6',
            text: `⏸️ 가장 많이 연기된 퀘스트\n${topDeferred.map(([name, count], i) => `${i + 1}. ${name} (${count}회)`).join('\n')}`,
        });
    }

    if (topCompleted.length > 0) {
        attachments.push({
            color: '#2ecc71',
            text: `✅ 가장 많이 완료된 퀘스트\n${topCompleted.map(([name, count], i) => `${i + 1}. ${name} (${count}회)`).join('\n')}`,
        });
    }

    return attachments;
}

// ─── Weekly attachments ───

export function buildWeeklyAttachments(
    weekStart: string,
    weekEnd: string,
    dailyLines: string[],
    weekTotal: number,
    weekDone: number,
    weekCancelled: number,
    weekRate: number,
): IMessageAttachment[] {
    const attachments: IMessageAttachment[] = [];

    attachments.push({
        color: '#3498db',
        text: `📅 주간 회고 (${weekStart} ~ ${weekEnd})\n${dailyLines.join('\n')}`,
    });

    attachments.push({
        color: '#f39c12',
        text: '📊 주간 종합',
        fields: [
            { title: 'Total', value: `${weekTotal}`, short: true },
            { title: '✅ Done', value: `${weekDone}`, short: true },
            { title: '❌ Canceled', value: `${weekCancelled}`, short: true },
            { title: '📈 완료율', value: `${weekRate}%`, short: true },
        ],
    });

    return attachments;
}

// ─── Deferred list attachments ───

export function buildDeferredAttachments(
    items: Array<{ name: string; priority: string; deferCount: number; originalDate: string; sourceName: string }>,
): IMessageAttachment[] {
    if (items.length === 0) {
        return [{ color: '#2ecc71', text: '🎉 연기된 퀘스트가 없습니다!' }];
    }

    const lines = items.map((item, i) => {
        const emoji = priorityEmoji(item.priority);
        const warn = item.deferCount >= 5 ? ' 🔥' : item.deferCount >= 3 ? ' ⚠️' : '';
        return `${i + 1}. [${emoji}] ${item.name}${warn}\n     📅 ${item.originalDate}  🔄 ${item.deferCount}회  📂 ${item.sourceName}`;
    });

    return [{
        color: '#9b59b6',
        text: `⏸️ 연기된 퀘스트 (${items.length}개)\n${lines.join('\n')}`,
    }];
}

// ─── Report attachments ───

export function buildReportAttachments(
    today: string,
    dow: string,
    done: number,
    total: number,
    rate: number,
    totalTime: number,
    remaining: number,
    deferred: number,
    incompleteNames: string[],
): IMessageAttachment[] {
    const color = rate >= 80 ? '#2ecc71' : rate >= 50 ? '#f39c12' : '#3498db';
    let encouragement = '';
    if (rate >= 90) encouragement = '🏆 완벽한 하루였어요!';
    else if (rate >= 70) encouragement = '💪 잘 해냈어요!';
    else if (rate >= 50) encouragement = '🌱 절반 이상 해냈어요!';
    else encouragement = '☕ 오늘은 쉬어가는 날!';

    const attachments: IMessageAttachment[] = [];

    attachments.push({
        color,
        text: `📊 ${today} (${dow}) 일일 리포트\n${progressBar(done / total, 15)}  **${rate}%** ${encouragement}`,
        fields: [
            { title: '✅ Done', value: `${done}`, short: true },
            { title: '📝 Remaining', value: `${remaining}`, short: true },
            { title: '⏱️ Time Invested', value: formatDuration(totalTime), short: true },
            { title: '⏸️ Deferred', value: `${deferred}`, short: true },
        ],
    });

    if (incompleteNames.length > 0) {
        attachments.push({
            color: '#95a5a6',
            text: `📝 미완료\n${incompleteNames.map((n) => `• ${n}`).join('\n')}`,
        });
    }

    return attachments;
}

// ─── Help attachments ───

export function buildHelpAttachments(): IMessageAttachment[] {
    return [
        {
            color: '#3498db',
            text: '📋 일일 퀘스트',
            fields: [
                { title: '/today', value: '오늘의 퀘스트 현황', short: true },
                { title: '/add {이름} {시간} {소요}', value: '태스크 추가', short: true },
                { title: '/complete', value: '퀘스트 완료 (버튼)', short: true },
                { title: '/cancel', value: '퀘스트 취소 (버튼)', short: true },
                { title: '/defer', value: '퀘스트 연기 (버튼)', short: true },
                { title: '/restore', value: '연기 퀘스트 복원', short: true },
                { title: '/start', value: '퀘스트 시작 (버튼)', short: true },
                { title: '/swap {A} {B}', value: '시간 교환', short: true },
                { title: '/memo {번호} {내용}', value: '메모 추가', short: true },
                { title: '/delete', value: '퀘스트 삭제 (버튼)', short: true },
            ],
        },
        {
            color: '#f39c12',
            text: '📊 조회/분석',
            fields: [
                { title: '/brief [all]', value: '마일스톤 브리핑', short: true },
                { title: '/stats [N]', value: '최근 N일 통계', short: true },
                { title: '/deferred', value: '연기 퀘스트 목록', short: true },
                { title: '/weekly', value: '주간 리포트', short: true },
                { title: '/report', value: '일일 리포트', short: true },
            ],
        },
        {
            color: '#2ecc71',
            text: '⚙️ 생성/관리',
            fields: [
                { title: '/gen', value: '퀘스트 생성 (루틴 복사)', short: true },
                { title: '/regen', value: '초기화 후 재생성', short: true },
            ],
        },
    ];
}

export function buildConfirmDialog(
    block: BlockBuilder,
    message: string,
    confirmActionId: string,
    cancelActionId: string,
): void {
    block.addSectionBlock({
        text: block.newMarkdownTextObject(message),
    });
    block.addActionsBlock({
        blockId: 'confirm_block',
        elements: [
            block.newButtonElement({
                actionId: confirmActionId,
                text: block.newPlainTextObject('✅ 확인'),
                value: 'confirm',
            }),
            block.newButtonElement({
                actionId: cancelActionId,
                text: block.newPlainTextObject('❌ 취소'),
                value: 'cancel',
            }),
        ],
    });
}

