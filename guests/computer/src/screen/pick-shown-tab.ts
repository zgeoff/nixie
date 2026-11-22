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

// Picks the tab a browser window shows, or null when no tracked tab is known to be in it. With one
// browser window it is the last visible tab, because a headless browser shows every tab. With
// several, a visible tab belongs to the window nearest its own rectangle when that window is close enough, and to none on a tie.
export function pickShownTab(
  window: DesktopWindow,
  browserWindows: readonly DesktopWindow[],
  tabs: readonly ReadTab[],
): ReadTab | null {
  const visible = tabs.filter((tab) => tab.isVisible);

  if (browserWindows.length === 1) {
    return visible.at(-1) ?? null;
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
  const ranked = windows
    .map((window) => ({ window, gap: measureGap(tab, window) }))
    .toSorted((first, second) => first.gap - second.gap);

  const [nearest, next] = ranked;

  return nearest !== undefined &&
    nearest.gap <= maxRectangleGap &&
    (next === undefined || nearest.gap < next.gap)
    ? nearest.window
    : null;
}

function measureGap(tab: ReadTab, window: DesktopWindow): number {
  return (
    Math.abs(tab.left - window.x) +
    Math.abs(tab.top - window.y) +
    Math.abs(tab.width - window.width) +
    Math.abs(tab.height - window.height)
  );
}
