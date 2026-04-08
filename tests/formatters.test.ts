import { describe, it, expect, vi } from 'vitest';
import {
    priorityEmoji,
    stateGroupEmoji,
    stateGroupLabel,
    progressBar,
    parseDuration,
    formatDuration,
    formatTime,
    todayString,
    nowTimeString,
    dayOfWeek,
    dDay,
} from '../src/ui/formatters';

describe('priorityEmoji', () => {
    it('returns correct emoji for each priority', () => {
        expect(priorityEmoji('urgent')).toBe('🔴');
        expect(priorityEmoji('high')).toBe('🟠');
        expect(priorityEmoji('medium')).toBe('🟡');
        expect(priorityEmoji('low')).toBe('🟢');
        expect(priorityEmoji('none')).toBe('⚪');
    });

    it('returns default for unknown priority', () => {
        expect(priorityEmoji('unknown')).toBe('⚪');
    });
});

describe('stateGroupEmoji / stateGroupLabel', () => {
    it('returns correct emoji and label for each group', () => {
        expect(stateGroupEmoji('unstarted')).toBe('📝');
        expect(stateGroupLabel('unstarted')).toBe('To-Do');
        expect(stateGroupEmoji('started')).toBe('🔄');
        expect(stateGroupLabel('started')).toBe('In Progress');
        expect(stateGroupEmoji('completed')).toBe('✅');
        expect(stateGroupLabel('completed')).toBe('Done');
        expect(stateGroupEmoji('cancelled')).toBe('❌');
        expect(stateGroupLabel('cancelled')).toBe('Canceled');
    });

    it('returns fallback for unknown group', () => {
        expect(stateGroupEmoji('other')).toBe('📋');
        expect(stateGroupLabel('other')).toBe('other');
    });
});

describe('progressBar', () => {
    it('returns full bar at 100%', () => {
        expect(progressBar(1.0, 10)).toBe('██████████');
    });

    it('returns empty bar at 0%', () => {
        expect(progressBar(0, 10)).toBe('░░░░░░░░░░');
    });

    it('returns half bar at 50%', () => {
        expect(progressBar(0.5, 10)).toBe('█████░░░░░');
    });

    it('respects custom width', () => {
        expect(progressBar(0.5, 4)).toBe('██░░');
    });

    it('handles edge ratio values', () => {
        expect(progressBar(0.05, 10)).toBe('█░░░░░░░░░');
        expect(progressBar(0.95, 10)).toBe('██████████');
    });
});

describe('parseDuration', () => {
    it('parses minutes only', () => {
        expect(parseDuration('30m')).toBe(30);
        expect(parseDuration('5m')).toBe(5);
    });

    it('parses hours only', () => {
        expect(parseDuration('1h')).toBe(60);
        expect(parseDuration('2h')).toBe(120);
    });

    it('parses combined hours and minutes', () => {
        expect(parseDuration('1h30m')).toBe(90);
        expect(parseDuration('2h15m')).toBe(135);
    });

    it('returns null for invalid input', () => {
        expect(parseDuration('abc')).toBeNull();
        expect(parseDuration('30')).toBeNull();
        expect(parseDuration('h')).toBeNull();
        expect(parseDuration('m')).toBeNull();
    });

    it('returns null for empty string (0 total)', () => {
        expect(parseDuration('')).toBeNull();
    });
});

describe('formatDuration', () => {
    it('formats minutes only', () => {
        expect(formatDuration(30)).toBe('30m');
        expect(formatDuration(5)).toBe('5m');
    });

    it('formats hours only', () => {
        expect(formatDuration(60)).toBe('1h');
        expect(formatDuration(120)).toBe('2h');
    });

    it('formats combined hours and minutes', () => {
        expect(formatDuration(90)).toBe('1h 30m');
        expect(formatDuration(135)).toBe('2h 15m');
    });

    it('formats zero', () => {
        expect(formatDuration(0)).toBe('0m');
    });
});

describe('formatTime', () => {
    it('returns the time string', () => {
        expect(formatTime('09:00')).toBe('09:00');
    });

    it('returns --:-- for undefined', () => {
        expect(formatTime(undefined)).toBe('--:--');
    });
});

describe('todayString / nowTimeString', () => {
    it('todayString returns YYYY-MM-DD format', () => {
        expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('nowTimeString returns HH:MM format', () => {
        expect(nowTimeString()).toMatch(/^\d{2}:\d{2}$/);
    });

    it('todayString returns KST date', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-07T23:30:00Z')); // 2026-04-08 08:30 KST
        expect(todayString()).toBe('2026-04-08');
        vi.useRealTimers();
    });
});

describe('dayOfWeek', () => {
    it('returns correct day names', () => {
        expect(dayOfWeek('2026-04-06')).toBe('월'); // Monday
        expect(dayOfWeek('2026-04-07')).toBe('화'); // Tuesday
        expect(dayOfWeek('2026-04-11')).toBe('토'); // Saturday
        expect(dayOfWeek('2026-04-12')).toBe('일'); // Sunday
    });
});

describe('dDay', () => {
    it('returns D-Day for today', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-07T12:00:00Z')); // 21:00 KST
        expect(dDay('2026-04-07')).toBe('D-Day');
        vi.useRealTimers();
    });

    it('returns D-N for future dates', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-07T12:00:00Z'));
        expect(dDay('2026-04-10')).toBe('D-3');
        expect(dDay('2026-04-30')).toBe('D-23');
        vi.useRealTimers();
    });

    it('returns D+N for past dates', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-04-07T12:00:00Z'));
        expect(dDay('2026-04-05')).toBe('D+2');
        vi.useRealTimers();
    });
});
