import type { LogRecord } from '@heynixie/log';
import type { InboxRenderContext } from '@heynixie/tasks';
import { renderSystemMessage, renderUntrustedText } from '@heynixie/wire';
import { handoverAskedFieldsSchema } from './handover-asked-codec';

// What the assistant reads of its own ask, with the ID that names it and the reason it gave inside
// the markers that a page read shows. The owner's name stands in the text, or "the user" when none
// is set.
export function renderHandoverAsked(record: LogRecord, context: InboxRenderContext): string {
  const first = `[#${String(record.sequence)}] You asked ${context.ownerName ?? 'the user'} to take over the computer.`;
  const reason = findReason(record);

  return renderSystemMessage({
    type: 'computer',
    at: context.at,
    body: [
      first,
      ...(reason === null ? [] : ['Reason:', ...renderUntrustedText(reason, context.mint)]),
    ].join('\n'),
  });
}

function findReason(record: LogRecord): string | null {
  if (record.erasable.status !== 'readable') {
    return null;
  }

  const parsed = handoverAskedFieldsSchema.safeParse(record.erasable.fields);

  return parsed.success ? parsed.data.reason : null;
}
