import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlaneClient } from '../src/plane/PlaneClient';

describe('PlaneClient.parseMeta', () => {
    it('returns empty object for null/undefined input', () => {
        expect(PlaneClient.parseMeta(null)).toEqual({});
        expect(PlaneClient.parseMeta(undefined)).toEqual({});
        expect(PlaneClient.parseMeta('')).toEqual({});
    });

    it('returns empty object when no meta marker exists', () => {
        expect(PlaneClient.parseMeta('<p>Hello world</p>')).toEqual({});
    });

    it('parses valid meta block', () => {
        const html = '<p>Task desc</p>\n<!-- DAILYFORGE_META: {"quest_date":"2026-04-07","defer_count":2} -->';
        const meta = PlaneClient.parseMeta(html);
        expect(meta.quest_date).toBe('2026-04-07');
        expect(meta.defer_count).toBe(2);
    });

    it('returns empty object for malformed JSON in meta', () => {
        const html = '<!-- DAILYFORGE_META: {bad json} -->';
        expect(PlaneClient.parseMeta(html)).toEqual({});
    });

    it('returns empty object when META_END is missing', () => {
        const html = '<!-- DAILYFORGE_META: {"quest_date":"2026-04-07"}';
        expect(PlaneClient.parseMeta(html)).toEqual({});
    });

    it('parses all DailyForgeMeta fields', () => {
        const meta = {
            quest_date: '2026-04-07',
            scheduled_time: '09:00',
            adjusted_duration_min: 45,
            generation_source: 'user_created',
            defer_count: 0,
            original_quest_date: '2026-04-05',
            source_project_id: 'proj-123',
            source_issue_id: 'issue-456',
        };
        const html = `<p>Desc</p>\n<!-- DAILYFORGE_META: ${JSON.stringify(meta)} -->`;
        expect(PlaneClient.parseMeta(html)).toEqual(meta);
    });
});

describe('PlaneClient.setMeta', () => {
    it('appends meta to empty description', () => {
        const result = PlaneClient.setMeta('', { quest_date: '2026-04-07' });
        expect(result).toContain('<!-- DAILYFORGE_META:');
        expect(result).toContain('"quest_date":"2026-04-07"');
        expect(result).toContain('-->');
    });

    it('appends meta to existing description', () => {
        const result = PlaneClient.setMeta('<p>Hello</p>', { quest_date: '2026-04-07' });
        expect(result).toMatch(/^<p>Hello<\/p>\n<!-- DAILYFORGE_META:/);
    });

    it('replaces existing meta block', () => {
        const original = '<p>Desc</p>\n<!-- DAILYFORGE_META: {"defer_count":1} -->';
        const result = PlaneClient.setMeta(original, { defer_count: 2 });
        expect(result).toContain('"defer_count":2');
        expect(result).not.toContain('"defer_count":1');
        // Should only have one meta block
        const matches = result.match(/DAILYFORGE_META/g);
        expect(matches).toHaveLength(1);
    });

    it('handles broken meta marker (no closing -->)', () => {
        const original = '<p>Desc</p>\n<!-- DAILYFORGE_META: {"defer_count":1}';
        const result = PlaneClient.setMeta(original, { defer_count: 2 });
        expect(result).toContain('"defer_count":2');
        expect(result).toContain('-->');
        // Should clean up and have only one marker
        const matches = result.match(/DAILYFORGE_META/g);
        expect(matches).toHaveLength(1);
    });

    it('preserves content before and after meta block', () => {
        const original = '<p>Before</p>\n<!-- DAILYFORGE_META: {"defer_count":1} -->\n<p>After</p>';
        const result = PlaneClient.setMeta(original, { defer_count: 3 });
        expect(result).toContain('<p>Before</p>');
        expect(result).toContain('<p>After</p>');
        expect(result).toContain('"defer_count":3');
    });

    it('roundtrips: parseMeta(setMeta(html, meta)) === meta', () => {
        const meta = { quest_date: '2026-04-07', defer_count: 5, adjusted_duration_min: 30 };
        const html = PlaneClient.setMeta('<p>Test</p>', meta);
        expect(PlaneClient.parseMeta(html)).toEqual(meta);
    });
});

describe('PlaneClient.todayKST', () => {
    it('returns YYYY-MM-DD format string', () => {
        const result = PlaneClient.todayKST();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('returns KST date (UTC+9)', () => {
        // Mock a time where UTC and KST differ: 2026-04-07 23:30 UTC = 2026-04-08 08:30 KST
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-07T23:30:00Z'));
        expect(PlaneClient.todayKST()).toBe('2026-04-08');
        vi.useRealTimers();
    });

    it('returns same date when KST and UTC agree', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-07T12:00:00Z')); // 21:00 KST, same day
        expect(PlaneClient.todayKST()).toBe('2026-04-07');
        vi.useRealTimers();
    });

    it('handles midnight KST boundary', () => {
        vi.useFakeTimers();
        // 2026-04-07 15:00 UTC = 2026-04-08 00:00 KST
        vi.setSystemTime(new Date('2026-04-07T15:00:00Z'));
        expect(PlaneClient.todayKST()).toBe('2026-04-08');
        vi.useRealTimers();
    });
});
