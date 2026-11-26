import type { LogRecord } from '@heynixie/log';
import type { InboxRenderContext } from '@heynixie/tasks';
import { renderSystemMessage } from '@heynixie/wire';
import { handoverClosedCodec } from './handover-closed-codec';

// What the assistant reads when its ask closed: the ID of its own withdrawal, in the owner's name
// or "the user" when none is set, or that the ask lapsed with no take-over.
export function renderHandoverClosed(record: LogRecord, context: InboxRenderContext): string {
  const closed = handoverClosedCodec.decode(record.payload);

  const text = {
    assistant: `You withdrew your ask for ${context.ownerName ?? 'the user'} to take over the computer.`,
    expired: `Your handover ask lapsed after ${formatMinutes(closed.waitedSeconds)} with no take-over.`,
  }[closed.by];

  return renderSystemMessage({
    type: 'computer',
    at: context.at,
    body: `[#${String(record.sequence)}] ${text}`,
  });
}

function formatMinutes(seconds: number): string {
  return `${String(Math.max(1, Math.round(seconds / 60)))} min`;
}
