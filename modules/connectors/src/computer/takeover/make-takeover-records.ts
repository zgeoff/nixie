import { createShortID } from '@heynixie/db';
import type { Definitions, Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { takeoverEndedCodec } from './takeover-ended-codec';
import { takeoverStartedCodec } from './takeover-started-codec';
import type { TakeoverRecords } from './types';

export interface TakeoverRecordsOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
}

// Writes the two records of a hold on the conversation's thread. Each takes a short ID, which the
// assistant reads in place of a row number.
export function makeTakeoverRecords(options: TakeoverRecordsOptions): TakeoverRecords {
  return {
    writeStarted: async (input) => {
      await writeRecords(options.log, [
        {
          kind: takeoverStartedCodec.kind,
          definitions: options.definitions(),
          thread: conversationTaskID,
          payload: takeoverStartedCodec.encode({ shortID: createShortID(), device: input.device }),
        },
      ]);
    },
    writeEnded: async (input) => {
      await writeRecords(options.log, [
        {
          kind: takeoverEndedCodec.kind,
          definitions: options.definitions(),
          thread: conversationTaskID,
          payload: takeoverEndedCodec.encode({
            shortID: createShortID(),
            by: input.by,
            durationSeconds: input.durationSeconds,
          }),
          erasable: {
            origins: [...(input.read?.origins ?? [])],
            tabs: (input.read?.tabs ?? []).map((open) => ({ tab: open.tab, origin: open.origin })),
            isRestarted: input.read?.isRestarted ?? false,
            now: input.read?.now ?? null,
          },
        },
      ]);
    },
  };
}
