import { describe, expect, it } from 'vitest';
import { isApplePlatform, undoShortcutLabel } from './platform.js';

describe('isApplePlatform', () => {
  it('recognizes macOS and iOS platform strings', () => {
    expect(isApplePlatform({ platform: 'MacIntel', userAgent: '' })).toBe(true);
    expect(isApplePlatform({ platform: 'iPhone', userAgent: '' })).toBe(true);
    expect(isApplePlatform({ platform: '', userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0)' })).toBe(
      true,
    );
  });

  it('returns false for Windows/Linux/Android platform strings', () => {
    expect(isApplePlatform({ platform: 'Win32', userAgent: '' })).toBe(false);
    expect(isApplePlatform({ platform: 'Linux x86_64', userAgent: '' })).toBe(false);
  });
});

describe('undoShortcutLabel', () => {
  it('uses the Cmd glyph on Apple platforms and Ctrl elsewhere', () => {
    expect(undoShortcutLabel({ platform: 'MacIntel', userAgent: '' })).toBe('⌘Z');
    expect(undoShortcutLabel({ platform: 'Win32', userAgent: '' })).toBe('Ctrl+Z');
  });
});
