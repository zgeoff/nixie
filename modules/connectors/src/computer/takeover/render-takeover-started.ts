import type { LogRecord } from '@heynixie/log';
import type { InboxRenderContext } from '@heynixie/tasks';
import { capitalizeFirst, renderSystemMessage } from '@heynixie/wire';

// What the assistant reads when a person takes the desktop, in the owner's name, or "the user" when
// none is set.
export function renderTakeoverStarted(record: LogRecord, context: InboxRenderContext): string {
  return renderSystemMessage({
    type: 'computer',
    at: context.at,
    body:
      `[#${String(record.sequence)}] ${capitalizeFirst(context.ownerName ?? 'the user')} took over the computer. You can ` +
      'read the screen and your tabs; your clicks, typing and commands wait until it comes back.',
  });
}
