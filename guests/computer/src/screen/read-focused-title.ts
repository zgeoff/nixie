import type { DesktopDriver } from './types';

const maxTitleLength = 200;

// The title of the window that has focus, cut to a length a hand-back can carry, or an empty one when
// no window has focus.
export async function readFocusedTitle(
  driver: Pick<DesktopDriver, 'readWindows' | 'readTitle'>,
): Promise<string> {
  const desktop = await driver.readWindows();

  if (desktop.activeID === null) {
    return '';
  }

  const title = await driver.readTitle(desktop.activeID);

  return title.slice(0, maxTitleLength);
}
