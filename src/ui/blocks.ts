import { BlockBuilder, BlockElementType, TextObjectType } from '@rocket.chat/apps-engine/definition/uikit';
import { IssueDisplayItem, priorityEmoji, formatTime } from './formatters';

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

