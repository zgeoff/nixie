import type { ProviderText } from '../types';
import type { PhoneCursor } from './phone-cursor';

// The cursor of the first start: the newest time the provider holds, and every text it holds at
// that time. With no text, every later text is new.
export function buildStartCursor(recent: readonly ProviderText[]): PhoneCursor {
  const since = Math.max(0, ...recent.map((text) => text.receivedAt));

  return {
    since,
    skip: recent.filter((text) => text.receivedAt === since).map((text) => text.messageID),
  };
}
