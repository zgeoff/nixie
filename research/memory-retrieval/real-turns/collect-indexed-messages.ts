// @boundaries-ignore a spike imports the code it measures
import { findTypedText } from '../../../modules/memory/src/find-typed-text.ts';
import type { PlainRecord } from './read-plain-export.ts';

// Rebuilds the text past-message retrieval indexed for each of the user's messages: the typed
// text, whole, which differs from the shown text for a pasted span or a message cut at display.
export function collectIndexedMessages(records: PlainRecord[]): Map<number, string> {
  return new Map(
    records.flatMap((record) => {
      const text = record.kind === 'owner_message' && record.erasable.status === 'readable' ? findTypedText(record.erasable.fields) : null;

      return text === null ? [] : [[record.sequence, text] as const];
    }),
  );
}
