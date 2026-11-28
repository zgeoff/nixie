import type { StatusEvent, StatusEventRange } from '@heynixie/connections';
import type { EventKind } from '@heynixie/sessions';
import { renderConnectionEvent } from './render-connection-event';

// The events block's entry for connections: a line for each change into a status the model hears
// of, each return to active, and each break that passed the notice time. The label and the account
// read when the block builds. The block never caps the entry, or a notice would fall off it.
export function buildConnectionStatusKind(
  readEvents: (range: StatusEventRange) => Promise<readonly StatusEvent[]>,
): EventKind<StatusEvent> {
  return {
    name: 'connection_status',
    isUncapped: true,
    read: async (range) => {
      const events = await readEvents(range);

      return events.map((event) => ({ sequence: event.sequence, at: event.atMs, detail: event }));
    },
    render: (detail, settings) => renderConnectionEvent(detail, settings.timeZone),
  };
}
