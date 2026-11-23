import { InvalidCursorError } from '../item/invalid-cursor-error';
import type { UsagePosition } from './compare-usage-position';

const cursorPattern = /^(?<surfaced>never|\d+)\.(?<created>\d+)$/u;

// The cursor that buildUsageCursor makes, or null with no cursor.
export function parseUsageCursor(cursor: string | undefined): UsagePosition | null {
  if (cursor === undefined) {
    return null;
  }

  const match = cursorPattern.exec(cursor);
  const surfaced = match?.groups?.['surfaced'];
  const created = match?.groups?.['created'];

  if (surfaced === undefined || created === undefined) {
    throw new InvalidCursorError(cursor);
  }

  const position = {
    surfacedAtMs: surfaced === 'never' ? null : Number(surfaced),
    createdSequence: Number(created),
  };

  if (
    !Number.isSafeInteger(position.createdSequence) ||
    !(position.surfacedAtMs === null || Number.isSafeInteger(position.surfacedAtMs))
  ) {
    throw new InvalidCursorError(cursor);
  }

  return position;
}
