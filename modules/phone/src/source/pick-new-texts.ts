import type { ProviderText } from '../types';
import type { PhoneCursor } from './phone-cursor';

// The texts of a read that the cursor has not passed.
export function pickNewTexts(
  texts: readonly ProviderText[],
  cursor: PhoneCursor,
): readonly ProviderText[] {
  return texts.filter(
    (text) =>
      text.receivedAt > cursor.since ||
      (text.receivedAt === cursor.since && !cursor.skip.includes(text.messageID)),
  );
}
