import { mandateEndedCodec, readMandateTitles } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { EventKind } from '@heynixie/sessions';

export interface MandateEndedEvent {
  readonly mandateID: string;
  readonly reason: 'ended' | 'expired';

  // null once a record forget removed the title
  readonly title: string | null;
}

const readLimit = 1000;

export function buildMandateEndedKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): EventKind<MandateEndedEvent> {
  return {
    name: 'mandate_ended',
    read: async (range) => {
      const records = await readRecords(log, {
        afterSequence: range.after,
        beforeSequence: range.through + 1,
        kinds: [mandateEndedCodec.kind],
        limit: readLimit,
      });

      const ended = records.map((entry) => ({
        sequence: entry.record.sequence,
        at: entry.record.recordedAt.getTime(),
        payload: mandateEndedCodec.decode(entry.record.payload),
      }));

      const titles = await readMandateTitles(
        { ...log, projections: [] },
        ended.map((entry) => entry.payload.mandateID),
      );

      return ended.map((entry) => ({
        sequence: entry.sequence,
        at: entry.at,
        detail: {
          mandateID: entry.payload.mandateID,
          reason: entry.payload.reason,
          title: titles.get(entry.payload.mandateID) ?? null,
        },
      }));
    },
    render: (detail) => {
      const title = detail.title === null ? '' : `: ${detail.title}`;

      return `Mandate ${detail.mandateID} ended (${detail.reason})${title}.`;
    },
  };
}
