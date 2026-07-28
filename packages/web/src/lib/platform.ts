/** Platform detection for the one thing the UI still says out loud: the undo shortcut. */

type NavigatorLike = Pick<Navigator, 'platform' | 'userAgent'>;

function currentNavigator(): NavigatorLike {
  return typeof navigator === 'undefined' ? { platform: '', userAgent: '' } : navigator;
}

/** True on macOS/iOS/iPadOS, where the undo shortcut is Cmd rather than Ctrl. */
export function isApplePlatform(nav: NavigatorLike = currentNavigator()): boolean {
  return /mac|iphone|ipad|ipod/i.test(nav.platform || nav.userAgent || '');
}

/** The platform-appropriate undo/redo modifier label, e.g. for a post-drag toast. */
export function undoShortcutLabel(nav: NavigatorLike = currentNavigator()): string {
  return isApplePlatform(nav) ? '⌘Z' : 'Ctrl+Z';
}
