import type { Call, CallsContext } from '../types';
import { writeFixedLine } from './write-fixed-line';

// Waits `hold_after_ms` after a hand-off and, when no answer has started, sends the fixed holding
// line through `say`. The line is no part of the answer. Once the speech layer has it, the line is
// a `call.spoke` record.
export async function startHoldingLine(
  context: CallsContext,
  call: Pick<Call, 'callID' | 'taskID'>,
  handOffID: string,
  signal: AbortSignal,
): Promise<void> {
  const voice = context.readVoiceDefinitions();

  await context.clock.sleep(voice.holdAfterMs, signal);

  const sessionID = context.sessions.get(call.callID);
  const handOff = context.runtime.handOffs.get(call.callID)?.get(handOffID);

  if (
    signal.aborted ||
    sessionID === undefined ||
    handOff === undefined ||
    handOff.isAnswered ||
    context.speech === null
  ) {
    return;
  }

  try {
    await context.speech.say(sessionID, voice.lines.holding);

    await writeFixedLine(context, call, voice.lines.holding);
  } catch (error) {
    context.logEvent('calls.holding_line_failed', {
      callID: call.callID,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
