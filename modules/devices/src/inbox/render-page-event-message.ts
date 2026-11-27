import type { LogRecord } from '@heynixie/log';
import type { InboxKind, InboxRenderContext } from '@heynixie/tasks';
import { renderSystemMessage } from '@heynixie/wire';
import { renderPageEvent } from '../page/render-page-event';
import { toRenderedPageEvent } from '../page/to-rendered-page-event';

// What the assistant reads when a page asked to wake it: the line that says where the event came
// from, then the page's own text inside the markers that a page read shows.
export function renderPageEventMessage(record: LogRecord, context: InboxRenderContext): string {
  const event = toRenderedPageEvent(record.payload, record.erasable);

  return renderSystemMessage({
    type: 'page-event',
    at: context.at,
    body: renderPageEvent(event, context.mint).join('\n'),
  });
}

// The inbox record of a page event. Only an event whose wake was kept is in the inbox, and it wakes.
export const deviceInboxKinds: readonly InboxKind[] = [
  { kind: 'device.page_event', wakes: () => true, render: renderPageEventMessage },
];
