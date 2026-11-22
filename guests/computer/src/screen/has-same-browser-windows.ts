import type { DesktopWindow } from './types';

// Whether two scans of the display list the same browser windows in the same places. A browser
// window that moved, opened or closed between them makes a tab-to-window match unsafe.
export function hasSameBrowserWindows(
  before: readonly DesktopWindow[],
  after: readonly DesktopWindow[],
): boolean {
  const first = before.filter((window) => window.kind === 'browser');
  const second = after.filter((window) => window.kind === 'browser');

  return (
    first.length === second.length &&
    first.every((window) => second.some((other) => isSameWindow(window, other)))
  );
}

function isSameWindow(first: DesktopWindow, second: DesktopWindow): boolean {
  return (
    first.id === second.id &&
    first.x === second.x &&
    first.y === second.y &&
    first.width === second.width &&
    first.height === second.height
  );
}
