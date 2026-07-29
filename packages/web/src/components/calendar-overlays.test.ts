import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTE_COLOR,
  NOTE_COLOR_PALETTE,
  positionDayMenu,
  positionRangeToolbar,
  rangeDates,
  rangeToolbarAnchor,
  STATUS_MENU_WIDTH,
} from './calendar-overlays.js';

describe('note colors', () => {
  it('defaults to a color in the preset palette', () => {
    expect(NOTE_COLOR_PALETTE).toHaveLength(7);
    expect(NOTE_COLOR_PALETTE.map(({ value }) => value)).toContain(DEFAULT_NOTE_COLOR);
  });
});

describe('positionDayMenu', () => {
  it('opens below an anchor when the lower viewport has more room', () => {
    expect(
      positionDayMenu({ left: 50, top: 100, bottom: 140 }, { width: 1000, height: 800 }),
    ).toEqual({
      left: 50,
      edge: 'top',
      offset: 144,
      maxHeight: 644,
    });
  });

  it('opens above and clamps horizontally near the viewport edge', () => {
    expect(
      positionDayMenu({ left: 950, top: 700, bottom: 740 }, { width: 1000, height: 800 }),
    ).toEqual({
      left: 778,
      edge: 'bottom',
      offset: 104,
      maxHeight: 684,
    });
  });

  it('limits the menu height so compact viewports can scroll it', () => {
    expect(
      positionDayMenu({ left: 20, top: 120, bottom: 160 }, { width: 400, height: 280 }),
    ).toEqual({
      left: 20,
      edge: 'top',
      offset: 164,
      maxHeight: 104,
    });
  });
});

describe('positionRangeToolbar', () => {
  const viewport = { width: 1200, height: 900 };

  it('clamps to the left edge when the selection starts near the viewport left', () => {
    const result = positionRangeToolbar({ left: -100, top: 200, bottom: 240 }, viewport);
    expect(result.left).toBe(12);
    expect(result.edge).toBe('top');
  });

  it('clamps to the right edge when the selection is centered near the viewport right', () => {
    const result = positionRangeToolbar({ left: 1150, top: 200, bottom: 240 }, viewport);
    expect(result.left).toBe(viewport.width - 12 - STATUS_MENU_WIDTH);
  });

  it('opens below (edge "top") when there is more room below than above', () => {
    const result = positionRangeToolbar({ left: 400, top: 100, bottom: 140 }, viewport);
    expect(result.edge).toBe('top');
    expect(result.offset).toBe(144);
  });

  it('opens above (edge "bottom") when there is more room above than below', () => {
    const result = positionRangeToolbar({ left: 400, top: 800, bottom: 840 }, viewport);
    expect(result.edge).toBe('bottom');
    expect(result.offset).toBe(viewport.height - 800 + 4);
  });

  it('shrinks to fit a narrow viewport while staying within the margins', () => {
    const narrow = { width: 320, height: 700 };
    const result = positionRangeToolbar({ left: 100, top: 100, bottom: 140 }, narrow);
    expect(result.left).toBeGreaterThanOrEqual(12);
    expect(result.left).toBeLessThanOrEqual(narrow.width - 12);
  });

  it('limits height on a short viewport so the toolbar can scroll internally', () => {
    const short = { width: 1200, height: 220 };
    const result = positionRangeToolbar({ left: 400, top: 110, bottom: 150 }, short);
    expect(result.maxHeight).toBeLessThan(short.height);
    expect(result.maxHeight).toBeGreaterThan(0);
  });
});

describe('rangeToolbarAnchor', () => {
  it('returns null for an empty selection', () => {
    expect(rangeToolbarAnchor([])).toBeNull();
  });

  it('centers the anchor horizontally on the union of the selected rects', () => {
    const rects = [
      { left: 100, right: 180, top: 200, bottom: 260 },
      { left: 180, right: 260, top: 200, bottom: 260 },
      { left: 260, right: 340, top: 200, bottom: 260 },
    ];
    const anchor = rangeToolbarAnchor(rects);
    expect(anchor).not.toBeNull();
    // union spans 100..340, center 220, offset by half the menu width
    expect(anchor?.left).toBe(220 - STATUS_MENU_WIDTH / 2);
    expect(anchor?.top).toBe(200);
    expect(anchor?.bottom).toBe(260);
  });
});

describe('rangeDates', () => {
  it('returns an empty array when either endpoint is missing', () => {
    expect(rangeDates(null, '2026-01-05')).toEqual([]);
    expect(rangeDates('2026-01-05', null)).toEqual([]);
    expect(rangeDates(null, null)).toEqual([]);
  });

  it('returns a single date when start and end are the same', () => {
    expect(rangeDates('2026-01-05', '2026-01-05')).toEqual(['2026-01-05']);
  });

  it('returns the inclusive ascending range when start is before end', () => {
    expect(rangeDates('2026-01-05', '2026-01-08')).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
    ]);
  });

  it('normalizes a reversed start/end into the same ascending range', () => {
    expect(rangeDates('2026-01-08', '2026-01-05')).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
    ]);
  });

  it('spans a month boundary correctly', () => {
    expect(rangeDates('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
  });
});
