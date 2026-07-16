import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTE_COLOR, NOTE_COLOR_PALETTE, positionDayMenu } from './calendar-overlays.js';

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
