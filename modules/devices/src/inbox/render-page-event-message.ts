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

// The generic line for a device that went online or offline, which names the record and its fields.
export function renderDeviceStatusMessage(record: LogRecord): string {
  return `A ${record.kind} record arrived: ${JSON.stringify(record.payload)}`;
}

// The inbox records of the devices. A page event is in the inbox only when its wake was kept: one
// without it waits in the events block of the conversation's next turn, which would otherwise show
// it twice.
export const deviceInboxKinds: readonly InboxKind[] = [
  { kind: 'device.status_changed', wakes: () => true, render: renderDeviceStatusMessage },
  {
    kind: 'device.page_event',
    isInbox: (payload) => payload['wake'] === true,
    wakes: () => true,
    render: renderPageEventMessage,
  },
];
