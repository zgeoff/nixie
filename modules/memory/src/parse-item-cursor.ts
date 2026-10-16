import { InvalidCursorError } from './invalid-cursor-error';

// Reads a page cursor, the creation sequence of the last item on the page before, or 0 for the
// first page.
export function parseItemCursor(after: string | undefined): number {
  if (after === undefined) {
    return 0;
  }

  if (!/^\d+$/u.test(after) || !Number.isSafeInteger(Number(after))) {
    throw new InvalidCursorError(after);
  }

  return Number(after);
}
