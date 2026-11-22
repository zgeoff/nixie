import type { DesktopWindow } from './types';

// What the guest reads from a tracked tab: whether it shows, where its browser window sits on the
// display and how far down its page begins.
export interface ReadTab {
  readonly id: string;
  readonly url: string;
  readonly isVisible: boolean;
  readonly pageTop: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

// With one browser window, the shown tab is the last visible one: a headless browser shows them all.
// With several, a tab goes to the one window close to its rectangle, and to none when 2 are close,
// because a window that moved between the two scans could take another's tab.
export function pickShownTab(
  window: DesktopWindow,
  browserWindows: readonly DesktopWindow[],
  tabs: readonly ReadTab[],
): ReadTab | null {
  const visible = tabs.filter((tab) => tab.isVisible);

  if (browserWindows.length === 1) {
    return visible.at(-1) ?? null;
  }

  // Each browser window shows one tab, so fewer visible tracked tabs than windows means a window is
  // untracked, and geometry alone can't keep a tab from a window that moved during the scan.
  if (visible.length < browserWindows.length) {
    return null;
  }

  return (
    visible.findLast((tab) => pickNearestWindow(tab, browserWindows)?.id === window.id) ?? null
  );
}

// How far a tab's rectangle may sit from its window's, in pixels summed over the 4 edges. The window
// manager's frame and the browser's own report differ by a few pixels, so a larger gap means the tab
// is in no window that the display lists.
const maxRectangleGap = 64;

function pickNearestWindow(tab: ReadTab, windows: readonly DesktopWindow[]): DesktopWindow | null {
  const close = windows.filter((window) => measureGap(tab, window) <= maxRectangleGap);

  return close.length === 1 ? (close[0] ?? null) : null;
}

function measureGap(tab: ReadTab, window: DesktopWindow): number {
  return (
    Math.abs(tab.left - window.x) +
    Math.abs(tab.top - window.y) +
    Math.abs(tab.width - window.width) +
    Math.abs(tab.height - window.height)
  );
}
