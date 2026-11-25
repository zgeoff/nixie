import { match } from 'ts-pattern';
import type { Call, CallsContext, SpeechEvent } from '../types';
import { startHoldingLine } from './start-holding-line';
import { writeHandOff } from './write-hand-off';
import { writeHeardCut } from './write-heard-cut';
import { writeHeardLine } from './write-heard-line';

// Takes one event of the call's speech session into the call's thread. A `heard` line becomes the
// user's message, small talk waits for the next hand-off, a hand-off starts the turn and the
// holding line's clock, and a cut interrupts the turn or marks the reply the user talked over.
export function runSpeechEvent(
  context: CallsContext,
  call: Call,
  event: SpeechEvent,
  signal: AbortSignal,
): Promise<void> {
  return match(event)
    .with({ kind: 'heard' }, (heard) => writeHeardLine(context, call, heard.text))
    .with({ kind: 'spoke' }, (spoke) => {
      const lines = context.runtime.smallTalk.get(call.callID) ?? [];

      context.runtime.smallTalk.set(call.callID, [
        ...lines,
        { text: spoke.text, heardChars: spoke.heardChars },
      ]);

      return Promise.resolve();
    })
    .with({ kind: 'hand_off' }, (handOff) => runHandOff(context, call, handOff, signal))
    .with({ kind: 'cut' }, (cut) => runCut(context, call, cut))
    .with({ kind: 'session_ending' }, { kind: 'dropped' }, () => Promise.resolve())
    .exhaustive();
}

async function runHandOff(
  context: CallsContext,
  call: Call,
  handOff: Extract<SpeechEvent, { kind: 'hand_off' }>,
  signal: AbortSignal,
): Promise<void> {
  const smallTalk = context.runtime.smallTalk.get(call.callID) ?? [];

  context.runtime.smallTalk.set(call.callID, []);

  const handOffs = context.runtime.handOffs.get(call.callID) ?? new Map();

  handOffs.set(handOff.handOffID, { isAnswered: false, replyRecordID: null });
  context.runtime.handOffs.set(call.callID, handOffs);

  await writeHandOff(context, call, {
    handOffID: handOff.handOffID,
    request: handOff.request,
    smallTalk,
  });

  // the clock of the holding line runs beside the turn, so the next event never waits on it
  void startHoldingLine(context, call, handOff.handOffID, signal);
}

async function runCut(
  context: CallsContext,
  call: Call,
  cut: Extract<SpeechEvent, { kind: 'cut' }>,
): Promise<void> {
  const handOff = context.runtime.handOffs.get(call.callID)?.get(cut.handOffID);

  if (handOff === undefined) {
    return;
  }

  if (!handOff.isAnswered || handOff.replyRecordID === null) {
    await context.interruptTurn(call.taskID);

    return;
  }

  await writeHeardCut(context, call, {
    handOffID: cut.handOffID,
    replyRecordID: handOff.replyRecordID,
    heardChars: cut.heardChars,
  });
}
