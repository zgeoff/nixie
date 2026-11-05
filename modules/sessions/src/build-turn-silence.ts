import type { EnvelopeRecord } from '@heynixie/log';
import { isOwnerMessageRecord } from '@heynixie/tasks';
import type { SilentEnd } from '@heynixie/tools';
import invariant from 'tiny-invariant';

type TakenRecord = Pick<EnvelopeRecord, 'kind' | 'payload' | 'thread'>;

export interface TurnSilence {
  readonly take: (record: TakenRecord) => void;

  readonly end: () => SilentEnd;
  readonly isSilent: () => boolean;
}

export function buildTurnSilence(opening: readonly TakenRecord[]): TurnSilence {
  let hasOwnerMessage = opening.some((record) => isOwnerMessageRecord(record));
  let isSilent = false;

  return {
    take: (record) => {
      invariant(!isSilent, 'a turn that ended silently takes no more messages');

      hasOwnerMessage ||= isOwnerMessageRecord(record);
    },
    end: () => {
      if (hasOwnerMessage) {
        return 'refused';
      }

      isSilent = true;

      return 'ended';
    },
    isSilent: () => isSilent,
  };
}
