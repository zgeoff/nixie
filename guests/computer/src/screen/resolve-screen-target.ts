import { z } from 'zod';
import { findWindowAt } from './find-window-at';
import { hasSameBrowserWindows } from './has-same-browser-windows';
import type { ReadTab } from './pick-shown-tab';
import { pickShownTab } from './pick-shown-tab';
import type { DesktopDriver, ScreenPage, ScreenSelection, ScreenTabs, ScreenTarget } from './types';

const noWindowID = 'none';

// A browser window that shows no tracked tab, or whose tab can't be matched safely, gets no tab, so
// its address bar and tab strip are never mistaken for page content.
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

  const read = await readTabs(tabs);

  // A browser window that moved while the tabs were read could sit where another's tab reports.
  const after = await driver.readWindows();

  const shown = hasSameBrowserWindows(windows, after.windows)
    ? pickShownTab(
        found,
        windows.filter((window) => window.kind === 'browser'),
        read,
      )
    : null;

  return shown === null
    ? { binding: { windowID: found.id, kind: 'browser' }, pageTop: null }
    : {
        binding: { windowID: found.id, kind: 'browser', tab: shown.id, url: shown.url },
        pageTop: shown.pageTop,
      };
}

async function readTabs(tabs: ScreenTabs): Promise<ReadTab[]> {
  const read: ReadTab[] = [];

  for (const [id, tab] of tabs) {
    const page = await readTab(tab.page);

    if (page !== null) {
      read.push({ id, url: tab.page.url(), ...page });
    }
  }

  return read;
}

// The viewport's top on the display is the window's top plus the height that its tab strip and
// address bar take, which the page reads as the gap between its outer and inner height.
const readPageScript = `JSON.stringify({
  isVisible: document.visibilityState === 'visible',
  pageTop: Math.round(window.screenY + window.outerHeight - window.innerHeight),
  left: window.screenX,
  top: window.screenY,
  width: window.outerWidth,
  height: window.outerHeight,
})`;

const pageSchema = z.object({
  isVisible: z.boolean(),
  pageTop: z.number(),
  left: z.number(),
  top: z.number(),
  width: z.number(),
  height: z.number(),
});

async function readTab(page: ScreenPage): Promise<z.infer<typeof pageSchema> | null> {
  try {
    const json: unknown = await page.evaluate(readPageScript);

    return typeof json === 'string' ? pageSchema.parse(JSON.parse(json)) : null;
  } catch {
    return null;
  }
}
