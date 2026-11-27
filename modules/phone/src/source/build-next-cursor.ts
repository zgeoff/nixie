import type { ProviderText } from '../types';
import type { PhoneCursor } from './phone-cursor';

// The cursor after the new texts of a read: the newest time among them and the cursor's own, and
// the message IDs at that time.
export function buildNextCursor(cursor: PhoneCursor, fresh: readonly ProviderText[]): PhoneCursor {
  const since = Math.max(cursor.since, ...fresh.map((text) => text.receivedAt));
  const ids = fresh.filter((text) => text.receivedAt === since).map((text) => text.messageID);

  return { since, skip: since === cursor.since ? [...cursor.skip, ...ids] : ids };
}
