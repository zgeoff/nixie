import type { Log } from '@heynixie/log';
import type { PromptProposalAnswerEvent } from '@heynixie/prompts';
import { readPromptProposalAnswers, renderPromptProposalAnswer } from '@heynixie/prompts';
import type { EventKind } from '@heynixie/sessions';

// modules/sessions imports modules/prompts, so the event kind that joins them lives here.
export function buildPromptProposalAnswerKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  thread: string,
): EventKind<PromptProposalAnswerEvent> {
  return {
    name: 'prompt_proposal_answer',
    read: (range) => readPromptProposalAnswers(log, thread, range),
    render: (detail, settings) =>
      renderPromptProposalAnswer(detail, { ownerName: settings.ownerName }),
  };
}
