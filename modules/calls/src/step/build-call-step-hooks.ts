import type { CallStepHooks } from '@heynixie/sessions';
import { closeCutHandOffs } from '../hand-off/close-cut-hand-offs';
import { sendTurnAnswer } from '../hand-off/send-turn-answer';
import { endAskedCall } from '../hang-up/end-asked-call';
import { hangUpToolName } from '../tool/build-hang-up-tool';
import type { CallsContext } from '../types';
import { callTurnPrompt } from '../voice/call-turn-prompt';
import { runCallStep } from './run-call-turn';

// The calls module's side of a call's turns, which the session runner calls around each model turn
// of a call's thread.
export function buildCallStepHooks(
  calls: CallsContext,
  conversationToolNames: readonly string[],
): CallStepHooks {
  return {
    prompt: callTurnPrompt,
    conversationToolNames,
    addedToolNames: [hangUpToolName],
    runStep: (step) =>
      runCallStep(step, {
        answer: (answer) => sendTurnAnswer(calls, answer),
        closeCutHandOffs: (callID, handOffIDs) => {
          closeCutHandOffs(calls, callID, handOffIDs);
        },
        endTurn: (callID) => endAskedCall(calls, callID),
      }),
  };
}
