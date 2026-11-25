import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { callAnsweredCodec } from '../record/call-answered-codec';
import { callStartedCodec } from '../record/call-started-codec';
import type { CallsContext } from '../types';
import { readRunningCall } from '../utils/read-call';
import { pickStartRefusal } from './pick-start-refusal';
import type { StartRefusal } from './pick-start-refusal';
import { readCallBudgets } from './read-call-budgets';
import { readHeadSequence } from './read-head-sequence';

export type StartResult =
  | { readonly status: 'started'; readonly callID: string }
  | { readonly status: 'refused'; readonly error: StartRefusal };

export interface StartCall {
  // the identity ID of the device session that starts the call and carries its audio
  readonly carryingSession: string;
}

// Checks the config, the speech layer, the price, the running call and both call budgets, then
// opens the call: its task and the started and answered records, in one transaction. A refused
// start writes nothing. The user's start is also the answer, so one wake covers both records.
export function startCall(context: CallsContext, input: StartCall): Promise<StartResult> {
  return withWriteTransaction(context.log.writer, async (tx): Promise<StartResult> => {
    const voice = context.readVoiceDefinitions();

    const refusal = pickStartRefusal({
      isVoiceOn: context.voice !== null,
      hasSpeechLayer: context.speech !== null,
      pricePerMinuteMicros: voice.pricePerMinuteMicros,
      isCallRunning: (await readRunningCall(tx)) !== null,
      budgets: await readCallBudgets(tx, context.budgets),
    });

    if (refusal !== null) {
      return { status: 'refused', error: refusal };
    }

    const callID = createShortID();

    const seedThrough = await readHeadSequence(tx);
    const taskID = await context.createTask(tx, { callID, seedThrough });

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: callStartedCodec.kind,
        definitions: context.definitions(),
        thread: conversationTaskID,
        payload: callStartedCodec.encode({
          callID,
          taskID,
          startedBy: 'you',
          carryingSession: input.carryingSession,
        }),
      },
      {
        kind: callAnsweredCodec.kind,
        definitions: context.definitions(),
        thread: conversationTaskID,
        payload: callAnsweredCodec.encode({ callID, carryingSession: input.carryingSession }),
      },
    ]);

    return { status: 'started', callID };
  });
}
