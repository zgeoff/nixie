import { createShortID } from '@heynixie/db';
import type { Definitions, Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { handoverAskedCodec } from './handover-asked-codec';
import { handoverClosedCodec } from './handover-closed-codec';
import type { HandoverRecords } from './types';

export interface HandoverRecordsOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
}

// Writes the two records of an ask on the conversation's thread, each with a short ID.
export function makeHandoverRecords(options: HandoverRecordsOptions): HandoverRecords {
  return {
    writeAsked: async (input) => {
      await writeRecords(options.log, [
        {
          kind: handoverAskedCodec.kind,
          definitions: options.definitions(),
          thread: conversationTaskID,
          payload: handoverAskedCodec.encode({ shortID: createShortID() }),
          erasable: { reason: input.reason },
        },
      ]);
    },
    writeClosed: async (input) => {
      await writeRecords(options.log, [
        {
          kind: handoverClosedCodec.kind,
          definitions: options.definitions(),
          thread: conversationTaskID,
          payload: handoverClosedCodec.encode({
            shortID: createShortID(),
            by: input.by,
            waitedSeconds: input.waitedSeconds,
          }),
        },
      ]);
    },
  };
}
