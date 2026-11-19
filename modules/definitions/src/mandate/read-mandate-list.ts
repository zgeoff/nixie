import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { collectMandateList } from './collect-mandate-list';
import type { ListedMandate, MandateEvent } from './collect-mandate-list';
import { mandateDeclinedCodec } from './mandate-declined-codec';
import { mandateEndedCodec } from './mandate-ended-codec';
import { mandateLapsedCodec } from './mandate-lapsed-codec';
import { mandateProposedCodec } from './mandate-proposed-codec';
import { mandateStartedCodec } from './mandate-started-codec';

const recordLimit = 500;

const mandateKinds = [
  mandateProposedCodec.kind,
  mandateStartedCodec.kind,
  mandateDeclinedCodec.kind,
  mandateLapsedCodec.kind,
  mandateEndedCodec.kind,
];

// Every mandate that a recent record names, in each state, the newest proposal first.
export async function readMandateList(log: Log, now: number): Promise<readonly ListedMandate[]> {
  const records = await readRecords(log, {
    afterSequence: 0,
    kinds: mandateKinds,
    order: 'newest',
    limit: recordLimit,
  });

  const events = records.toReversed().flatMap((entry): MandateEvent[] => {
    const record = entry.record;

    if (record.kind === mandateProposedCodec.kind) {
      const erasable = record.erasable;

      return [
        {
          type: 'proposed',
          proposed: mandateProposedCodec.decode(record.payload),
          fields: erasable.status === 'readable' ? erasable.fields : null,
        },
      ];
    }

    if (record.kind === mandateStartedCodec.kind) {
      return [{ type: 'started', ...mandateStartedCodec.decode(record.payload) }];
    }

    if (record.kind === mandateDeclinedCodec.kind) {
      return [{ type: 'declined', ...mandateDeclinedCodec.decode(record.payload) }];
    }

    if (record.kind === mandateLapsedCodec.kind) {
      return [{ type: 'lapsed', ...mandateLapsedCodec.decode(record.payload) }];
    }

    if (record.kind === mandateEndedCodec.kind) {
      return [{ type: 'ended', ...mandateEndedCodec.decode(record.payload) }];
    }

    return [];
  });

  return collectMandateList(events, now);
}
