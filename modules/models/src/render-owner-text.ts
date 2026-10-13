import type { LogRecord } from '@heynixie/log';

// Renders the words of your message as you wrote it. A message whose text was forgotten keeps its
// place with a note, so the model never reads a gap as silence.
export function renderOwnerText(record: LogRecord): string {
  const text = record.erasable.status === 'readable' ? record.erasable.fields['text'] : undefined;

  return typeof text === 'string' ? text : '[a message you sent, since forgotten]';
}
