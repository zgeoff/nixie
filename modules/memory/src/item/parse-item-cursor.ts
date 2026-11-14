import { InvalidCursorError } from './invalid-cursor-error';

export function parseItemCursor(after: string | undefined): number {
  if (after === undefined) {
    return 0;
  }

  if (!/^\d+$/u.test(after) || !Number.isSafeInteger(Number(after))) {
    throw new InvalidCursorError(after);
  }

  return Number(after);
}
