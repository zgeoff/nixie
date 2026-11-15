import { mandateStartedCodec, readMandateTitles } from '@heynixie/definitions';
import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { EventKind } from '@heynixie/sessions';
import { formatMandateTime } from './format-mandate-time';

export interface MandateStartedEvent {
  readonly mandateID: string;

  // null once a record forget removed the title
  readonly title: string | null;
  readonly expires: number;
}

const readLimit = 1000;

export function buildMandateStartedKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
): EventKind<MandateStartedEvent> {
  return {
    name: 'mandate_started',
    read: async (range) => {
      const records = await readRecords(log, {
        afterSequence: range.after,
        beforeSequence: range.through + 1,
        kinds: [mandateStartedCodec.kind],
        limit: readLimit,
      });

      const started = records.map((entry) => ({
        sequence: entry.record.sequence,
        at: entry.record.recordedAt.getTime(),
        payload: mandateStartedCodec.decode(entry.record.payload),
      }));

      const titles = await readMandateTitles(
        { ...log, projections: [] },
        started.map((entry) => entry.payload.mandateID),
      );

      return started.map((entry) => ({
        sequence: entry.sequence,
        at: entry.at,
        detail: {
          mandateID: entry.payload.mandateID,
          title: titles.get(entry.payload.mandateID) ?? null,
          expires: entry.payload.expires,
        },
      }));
    },
    render: (detail, settings) => {
      const title = detail.title === null ? '' : `: ${detail.title}`;
      const until = formatMandateTime(detail.expires, settings.timeZone);

      return `Mandate ${detail.mandateID} started${title}, until ${until}.`;
    },
  };
}
