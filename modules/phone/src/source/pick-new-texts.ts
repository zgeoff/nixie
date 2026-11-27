import type { ProviderText } from '../types';
import type { PhoneCursor } from './phone-cursor';

// The texts of a read to store: each one the cursor has not passed, and each later one nixie has not
// stored. A provider can list a text after the cursor passed its receive time, so the read reaches
// back behind the cursor, and the stored message IDs keep a text from being taken twice.
export function pickNewTexts(
  texts: readonly ProviderText[],
  cursor: PhoneCursor,
  storedMessageIDs: ReadonlySet<string>,
): readonly ProviderText[] {
  return texts.filter(
    (text) =>
      text.receivedAt > cursor.since ||
      (text.receivedAt === cursor.since && !cursor.skip.includes(text.messageID)) ||
      (text.receivedAt > cursor.floor && !storedMessageIDs.has(text.messageID)),
  );
}
