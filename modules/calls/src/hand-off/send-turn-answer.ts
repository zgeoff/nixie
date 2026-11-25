import type { CallsContext } from '../types';
import { pickAnswerText } from './pick-answer-text';

export interface TurnAnswer {
  readonly callID: string;
  readonly handOffID: string;

  // the text of each reply record the turn wrote, in order
  readonly replies: readonly string[];

  // the record that holds the reply a cut marks, or null when the turn wrote none
  readonly replyRecordID: string | null;

  // true when the turn failed, ended on a proposal or passed a limit
  readonly isFailed: boolean;
}

// Sends the speech layer nixie's whole answer to a hand-off, as one `answer` call, when the turn
// ends. A call that is over, or a hand-off that already has its answer, gets nothing.
export async function sendTurnAnswer(context: CallsContext, answer: TurnAnswer): Promise<void> {
  const sessionID = context.sessions.get(answer.callID);
  const handOff = context.runtime.handOffs.get(answer.callID)?.get(answer.handOffID);

  if (context.speech === null || sessionID === undefined || handOff === undefined) {
    return;
  }

  handOff.isAnswered = true;
  handOff.replyRecordID = answer.replyRecordID;

  const text = pickAnswerText({
    replies: answer.replies,
    isFailed: answer.isFailed,
    lines: context.readVoiceDefinitions().lines,
  });

  try {
    await context.speech.answer(sessionID, answer.handOffID, text, true);
  } catch (error) {
    context.logEvent('calls.answer_failed', {
      callID: answer.callID,
      handOffID: answer.handOffID,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
