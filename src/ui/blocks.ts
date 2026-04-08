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
    if (header) {
        block.addSectionBlock({
            text: block.newMarkdownTextObject(header),
        });
        block.addDividerBlock();
    }
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
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

export function buildTodaySummaryBlocks(block: BlockBuilder, items: IssueDisplayItem[]): void {
    const today = todayString();
    const dow = dayOfWeek(today);
    const total = items.length;
    const done = items.filter((i) => i.state.group === 'completed').length;
    const deferred = items.filter((i) => i.state.name.toLowerCase().includes('deferred')).length;
    const cancelled = items.filter((i) => i.state.group === 'cancelled').length;
    const todo = items.filter((i) =>
        (i.state.group === 'unstarted' || i.state.group === 'backlog') && !i.state.name.toLowerCase().includes('deferred'),
    ).length;
    const inProgress = items.filter((i) => i.state.group === 'started').length;
    const remaining = items
        .filter((i) => i.state.group !== 'completed' && i.state.group !== 'cancelled')
        .reduce((sum, i) => sum + (i.meta.adjusted_duration_min || 0), 0);
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
            `All: *${total}*  ✅ Done: *${done}*  📝 To-Do: *${todo}*  🔄 In Progress: *${inProgress}*\n` +
            `⏸️ Deferred: *${deferred}*  ❌ Canceled: *${cancelled}*  ⏱️ 남은 시간: *${formatDuration(remaining)}*`,
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

export function buildTodaySummaryAttachments(items: IssueDisplayItem[]): IMessageAttachment[] {
    const today = todayString();
    const dow = dayOfWeek(today);
    const total = items.length;
    const done = items.filter((i) => i.state.group === 'completed').length;
    const deferred = items.filter((i) => i.state.name.toLowerCase().includes('deferred')).length;
    const cancelled = items.filter((i) => i.state.group === 'cancelled').length;
    const todo = items.filter((i) =>
        (i.state.group === 'unstarted' || i.state.group === 'backlog') && !i.state.name.toLowerCase().includes('deferred'),
    ).length;
    const inProgress = items.filter((i) => i.state.group === 'started').length;
    const remaining = items
        .filter((i) => i.state.group !== 'completed' && i.state.group !== 'cancelled')
        .reduce((sum, i) => sum + (i.meta.adjusted_duration_min || 0), 0);
    const rate = total > 0 ? Math.round((done / total) * 100) : 0;
    const bar = progressBar(rate / 100, 15);

    // Pick color based on progress
    const color = rate >= 80 ? '#2ecc71' : rate >= 40 ? '#f39c12' : '#3498db';

    const attachments: IMessageAttachment[] = [];

    // Summary card
    attachments.push({
        color,
        title: { value: `📋 ${today} (${dow}) 오늘의 퀘스트` },
        text: `${bar}  **${rate}%**`,
        fields: [
            { title: '✅ Done', value: `${done}`, short: true },
            { title: '📝 To-Do', value: `${todo}`, short: true },
            { title: '🔄 In Progress', value: `${inProgress}`, short: true },
            { title: '⏱️ 남은 시간', value: formatDuration(remaining), short: true },
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

    let idx = 1;
    for (const { key, emoji, label, color: groupColor } of groupConfig) {
        const groupItems = grouped.get(key) || [];
        if (groupItems.length === 0) continue;

        const lines = groupItems.map((item) => formatIssueOneLiner(item, idx++)).join('\n');
        attachments.push({
            color: groupColor,
            title: { value: `${emoji} ${label}` },
            text: lines,
        });
    }

    if (deferredItems.length > 0) {
        const lines = deferredItems.map((item) => formatIssueOneLiner(item, idx++)).join('\n');
        attachments.push({
            color: '#9b59b6',
            title: { value: '⏸️ Deferred' },
            text: lines,
        });
    }

    return attachments;
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

