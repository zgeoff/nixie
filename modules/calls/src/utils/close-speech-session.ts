import type { CallsContext } from '../types';

export interface SpeechSessionClose {
  readonly callID: string;
  readonly sessionID: string;

  // the speech layer says the budget line before the session closes
  readonly isBudgetEnd: boolean;
}

// Closes the speech session whatever the budget line does, so a line that fails never leaves the
// session open.
export async function closeSpeechSession(
  context: CallsContext,
  close: SpeechSessionClose,
): Promise<void> {
  const speech = context.speech;

  if (speech === null) {
    return;
  }

  if (close.isBudgetEnd) {
    try {
      await speech.say(close.sessionID, context.readVoiceDefinitions().lines.budget);
    } catch (error) {
      context.logEvent('calls.session_say_failed', {
        callID: close.callID,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    await speech.close(close.sessionID);
  } catch (error) {
    context.logEvent('calls.session_close_failed', {
      callID: close.callID,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
