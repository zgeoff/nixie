import type { ScreenBinding } from '@heynixie/wire';
import { z } from 'zod';
import { findWindowAt } from './find-window-at';
import type {
  DesktopDriver,
  DesktopWindow,
  ScreenPage,
  ScreenSelection,
  ScreenTabs,
  ScreenTarget,
} from './types';

const noWindowID = 'none';

// Finds the window a screen act lands on: the one under the point, or the focused one. A browser
// window takes the tab it shows, which is the visible one. A browser window that shows no tab is
// another window.
export async function resolveScreenTarget(
  driver: DesktopDriver,
  tabs: ScreenTabs,
  selection: ScreenSelection,
): Promise<ScreenTarget> {
  const snapshot = await driver.readWindows();

  const windows = snapshot.windows;

  const found =
    selection.kind === 'point'
      ? findWindowAt(windows, selection.x, selection.y)
      : (windows.find((window) => window.id === snapshot.activeID) ?? null);

  if (found === null) {
    return { binding: { windowID: noWindowID, kind: 'other' }, pageTop: null };
  }

  if (found.kind !== 'browser') {
    return { binding: { windowID: found.id, kind: found.kind }, pageTop: null };
  }

  return resolveBrowserWindow(found, tabs);
}

async function resolveBrowserWindow(
  window: DesktopWindow,
  tabs: ScreenTabs,
): Promise<ScreenTarget> {
  // the last visible tab wins, because a headless browser shows every tab
  let shown: { binding: ScreenBinding; pageTop: number } | null = null;

  for (const [id, tab] of tabs) {
    const read = await readTab(tab.page);

    if (read !== null && read.isVisible) {
      shown = {
        binding: { windowID: window.id, kind: 'browser', tab: id, url: tab.page.url() },
        pageTop: read.pageTop,
      };
    }
  }

  return shown ?? { binding: { windowID: window.id, kind: 'other' }, pageTop: null };
}

// The viewport's top on the display is the window's top plus the height that its tab strip and
// address bar take, which the page reads as the gap between its outer and inner height.
const readPageScript = `JSON.stringify({
  isVisible: document.visibilityState === 'visible',
  pageTop: Math.round(window.screenY + window.outerHeight - window.innerHeight),
})`;

const pageSchema = z.object({ isVisible: z.boolean(), pageTop: z.number() });

async function readTab(page: ScreenPage): Promise<z.infer<typeof pageSchema> | null> {
  try {
    const json: unknown = await page.evaluate(readPageScript);

    return typeof json === 'string' ? pageSchema.parse(JSON.parse(json)) : null;
  } catch {
    return null;
  }
}
