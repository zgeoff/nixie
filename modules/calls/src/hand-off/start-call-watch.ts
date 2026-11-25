import type { Call, CallsContext } from '../types';
import { runSpeechEvent } from './run-speech-event';

// Reads the call's speech session until it closes, one event at a time, and stops when the call
// ends. An event that fails to reach the log is logged, and the next one still goes in.
export function startCallWatch(context: CallsContext, call: Call, sessionID: string): void {
  const speech = context.speech;

  if (speech === null) {
    return;
  }

  const stopping = new AbortController();

  context.runtime.watches.set(call.callID, stopping);
  void runWatch(context, call, speech.events(sessionID), stopping.signal);
}

async function runWatch(
  context: CallsContext,
  call: Call,
  events: AsyncIterable<Parameters<typeof runSpeechEvent>[2]>,
  signal: AbortSignal,
): Promise<void> {
  try {
    for await (const event of events) {
      if (signal.aborted) {
        return;
      }

      try {
        await runSpeechEvent(context, call, event, signal);
      } catch (error) {
        context.logEvent('calls.speech_event_failed', {
          callID: call.callID,
          kind: event.kind,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } catch (error) {
    context.logEvent('calls.speech_watch_failed', {
      callID: call.callID,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
