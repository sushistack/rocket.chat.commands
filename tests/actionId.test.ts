import { describe, it, expect } from 'vitest';

// Test the actionId parsing logic used in ActionHandler
// Extracted here since ActionHandler depends on RC types we can't easily mock

function parseActionId(actionId: string): { action: string; issueId: string } | null {
    const underscoreIdx = actionId.indexOf('_');
    if (underscoreIdx === -1) return null;
    return {
        action: actionId.substring(0, underscoreIdx),
        issueId: actionId.substring(underscoreIdx + 1),
    };
}

describe('ActionId parsing', () => {
    it('parses standard action_issueId format', () => {
        const result = parseActionId('complete_abc123');
        expect(result).toEqual({ action: 'complete', issueId: 'abc123' });
    });

    it('handles UUID-style issue IDs (hyphens only)', () => {
        const result = parseActionId('defer_018f3a1b-4c2d-7890-abcd-ef1234567890');
        expect(result).toEqual({
            action: 'defer',
            issueId: '018f3a1b-4c2d-7890-abcd-ef1234567890',
        });
    });

    it('returns null for actionId without underscore', () => {
        expect(parseActionId('nounderscore')).toBeNull();
    });

    it('handles all known action prefixes', () => {
        const actions = ['complete', 'cancel', 'defer', 'restore', 'start', 'edit', 'regen'];
        for (const action of actions) {
            const result = parseActionId(`${action}_issue123`);
            expect(result?.action).toBe(action);
            expect(result?.issueId).toBe('issue123');
        }
    });

    it('handles regen confirm/cancel values', () => {
        const confirm = parseActionId('regen_confirm');
        expect(confirm).toEqual({ action: 'regen', issueId: 'confirm' });

        const cancel = parseActionId('regen_cancel');
        expect(cancel).toEqual({ action: 'regen', issueId: 'cancel' });
    });

    it('splits only on first underscore', () => {
        const result = parseActionId('complete_issue_with_underscores');
        expect(result).toEqual({
            action: 'complete',
            issueId: 'issue_with_underscores',
        });
    });
});
