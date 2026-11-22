import type { DesktopWindow } from './types';

// The topmost window that holds the point, from windows ordered bottom to top.
export function findWindowAt(
  windows: readonly DesktopWindow[],
  x: number,
  y: number,
): DesktopWindow | null {
  const holding = windows.filter(
    (window) =>
      x >= window.x && x < window.x + window.width && y >= window.y && y < window.y + window.height,
  );

  return holding.at(-1) ?? null;
}
