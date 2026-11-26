import { match } from 'ts-pattern';
import type { Call, CallsContext, HandOff, SpeechEvent } from '../types';
import { startReconnectWait } from '../utils/start-reconnect-wait';
import { startHoldingLine } from './start-holding-line';
import { writeHandOff } from './write-hand-off';
import { writeHeardCut } from './write-heard-cut';
import { writeHeardLine } from './write-heard-line';

// Takes one event of the call's speech session into the call's thread: a `heard` line is the user's
// message, small talk waits for the next hand-off, a hand-off starts the turn, a cut interrupts it
// or marks the reply, and a dropped session or one near its limit waits for the device's new offer.
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
    .with({ kind: 'session_ending' }, () => {
      startReconnectWait(context, call.callID, 'session_limit');

      return Promise.resolve();
    })
    .with({ kind: 'dropped' }, () => {
      // the carrying device gets 30 s to send a new offer before the sweep ends the call
      context.sessions.delete(call.callID);

      startReconnectWait(context, call.callID, 'dropped');

      return Promise.resolve();
    })
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

  const handOffs = context.runtime.handOffs.get(call.callID) ?? new Map<string, HandOff>();

  const holding = new AbortController();

  handOffs.set(handOff.handOffID, { isAnswered: false, replyRecordID: null, holding });
  context.runtime.handOffs.set(call.callID, handOffs);

  await writeHandOff(context, call, {
    handOffID: handOff.handOffID,
    request: handOff.request,
    smallTalk,
  });

  // the clock of the holding line runs beside the turn, so the next event never waits on it
  void startHoldingLine(
    context,
    call,
    handOff.handOffID,
    AbortSignal.any([signal, holding.signal]),
  );
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

  // The user talked before the answer, so the turn that runs it stops and says no holding line.
  if (!handOff.isAnswered) {
    handOff.holding.abort();

    await context.interruptTurn(call.taskID);

    return;
  }

  // A fixed line, or a hand-off a cut turn closed, holds no reply to mark, and its turn has ended.
  if (handOff.replyRecordID === null) {
    return;
  }

  await writeHeardCut(context, call, {
    handOffID: cut.handOffID,
    replyRecordID: handOff.replyRecordID,
    heardChars: cut.heardChars,
  });
}
