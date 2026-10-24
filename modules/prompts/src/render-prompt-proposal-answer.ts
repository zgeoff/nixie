import { proposalLapseMs } from '@heynixie/proposals';
import { match } from 'ts-pattern';
import type { PromptProposalAnswerEvent } from './types';

const lapseDays = proposalLapseMs / (24 * 60 * 60 * 1000);

export interface PromptAnswerSettings {
  readonly ownerName: string | null;
}

export function renderPromptProposalAnswer(
  detail: PromptProposalAnswerEvent,
  settings: PromptAnswerSettings,
): string {
  const owner = settings.ownerName ?? 'The owner';
  const proposal = `your prompt proposal ${detail.proposalID} (${detail.promptID})`;

  return match(detail.outcome)
    .with(
      'lapsed',
      () =>
        `Your prompt proposal ${detail.proposalID} (${detail.promptID}) lapsed after ` +
        `${lapseDays} days with no answer.`,
    )
    .with('approved', () => {
      const edits = detail.isEdited ? ' with edits' : '';

      return (
        `${owner} approved ${proposal}${edits}. nixie opens a pull request to the definitions ` +
        'repo with it, and the override applies only after that pull request merges and live ' +
        'is promoted.'
      );
    })
    .with('rejected', () => {
      const line = `${owner} rejected ${proposal}.`;

      return detail.reason === null ? line : `${line} Reason: "${detail.reason}".`;
    })
    .exhaustive();
}
