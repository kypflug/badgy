import { describe, expect, it } from 'vitest';
import { yearDayLabel, yearDayState, yearMonthMetadata } from './year-planner-model.js';

describe('yearMonthMetadata', () => {
  it('shows away days when a month contains vacation or holiday time', () => {
    expect(
      yearMonthMetadata([{ status: 'office' }, { status: 'vacation' }, { status: 'holiday' }]),
    ).toBe('2 away');
  });

  it('otherwise shows office days', () => {
    expect(
      yearMonthMetadata([{ status: 'office' }, { status: 'office' }, { status: 'remote' }]),
    ).toBe('2 in');
  });
});

describe('year day presentation', () => {
  it('distinguishes planned and recorded dots', () => {
    expect(yearDayState({ isFuture: true })).toBe('planned');
    expect(yearDayState({ isFuture: false })).toBe('recorded');
  });

  it('builds a full accessible label with holiday and timing details', () => {
    expect(
      yearDayLabel(
        {
          date: '2026-07-04',
          status: 'holiday',
          isFuture: false,
          isHoliday: true,
          isToday: true,
        },
        'Independence Day',
      ),
    ).toBe('July 4, 2026 · Holiday · Independence Day · Today · Recorded');
  });
});
