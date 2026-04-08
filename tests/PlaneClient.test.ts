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
        const html = '<p>Task desc</p><details><summary>meta</summary><code>DFMETA:{"quest_date":"2026-04-07","defer_count":2}</code></details>';
        const meta = PlaneClient.parseMeta(html);
        expect(meta.quest_date).toBe('2026-04-07');
        expect(meta.defer_count).toBe(2);
    });

    it('returns empty object for malformed JSON in meta', () => {
        const html = '<details><summary>meta</summary><code>DFMETA:{bad json}</code></details>';
        expect(PlaneClient.parseMeta(html)).toEqual({});
    });

    it('returns empty object when DFMETA prefix is missing', () => {
        const html = '<details><summary>meta</summary><code>{"quest_date":"2026-04-07"}</code></details>';
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
        const html = `<p>Desc</p><details><summary>meta</summary><code>DFMETA:${JSON.stringify(meta)}</code></details>`;
        expect(PlaneClient.parseMeta(html)).toEqual(meta);
    });
});

describe('PlaneClient.setMeta', () => {
    it('appends meta to empty description', () => {
        const result = PlaneClient.setMeta('', { quest_date: '2026-04-07' });
        expect(result).toContain('DFMETA:');
        expect(result).toContain('"quest_date":"2026-04-07"');
        expect(result).toContain('<details><summary>meta</summary><code>');
    });

    it('appends meta to existing description', () => {
        const result = PlaneClient.setMeta('<p>Hello</p>', { quest_date: '2026-04-07' });
        expect(result).toMatch(/^<p>Hello<\/p>/);
        expect(result).toContain('DFMETA:');
    });

    it('replaces existing meta block', () => {
        const original = '<p>Desc</p><details><summary>meta</summary><code>DFMETA:{"defer_count":1}</code></details>';
        const result = PlaneClient.setMeta(original, { defer_count: 2 });
        expect(result).toContain('"defer_count":2');
        expect(result).not.toContain('"defer_count":1');
        const matches = result.match(/DFMETA/g);
        expect(matches).toHaveLength(1);
    });

    it('handles incomplete meta block', () => {
        const original = '<p>Desc</p><details><summary>meta</summary><code>DFMETA:{"defer_count":1}</code></details>';
        const result = PlaneClient.setMeta(original, { defer_count: 2 });
        expect(result).toContain('"defer_count":2');
        const matches = result.match(/DFMETA/g);
        expect(matches).toHaveLength(1);
    });

    it('preserves content before meta block', () => {
        const original = '<p>Before</p><details><summary>meta</summary><code>DFMETA:{"defer_count":1}</code></details>';
        const result = PlaneClient.setMeta(original, { defer_count: 3 });
        expect(result).toContain('<p>Before</p>');
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
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-07T23:30:00Z'));
        expect(PlaneClient.todayKST()).toBe('2026-04-08');
        vi.useRealTimers();
    });

    it('returns same date when KST and UTC agree', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-07T12:00:00Z'));
        expect(PlaneClient.todayKST()).toBe('2026-04-07');
        vi.useRealTimers();
    });

    it('handles midnight KST boundary', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-07T15:00:00Z'));
        expect(PlaneClient.todayKST()).toBe('2026-04-08');
        vi.useRealTimers();
    });
});
