import type { RenderedPageEvent } from '@heynixie/devices';
import { devicePageEventCodec, renderPageEvent, toRenderedPageEvent } from '@heynixie/devices';
import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { EventKind } from '@heynixie/sessions';

const readLimit = 1000;

// A page event that did not wake the conversation, which waits in the events block of its next
// turn. A page event that woke it reaches the conversation through its inbox, so this entry leaves
// it out and the event never shows twice. The page's text stays inside the markers of a page read.
export function buildPageEventKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): EventKind<RenderedPageEvent> {
  return {
    name: 'page_event',
    read: async (range) => {
      const records = await readRecords(log, {
        afterSequence: range.after,
        beforeSequence: range.through + 1,
        kinds: [devicePageEventCodec.kind],
        limit: readLimit,
      });

      return records.flatMap((entry) =>
        devicePageEventCodec.decode(entry.record.payload).wake
          ? []
          : [
              {
                sequence: entry.record.sequence,
                at: entry.record.recordedAt.getTime(),
                detail: toRenderedPageEvent(entry.record.payload, entry.record.erasable),
              },
            ],
      );
    },
    render: (detail) => renderPageEvent(detail).join('\n'),
  };
}
