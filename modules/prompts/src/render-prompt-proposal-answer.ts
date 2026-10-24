import { proposalLapseMs } from '@heynixie/proposals';
import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import type { PromptProposalAnswerEvent } from './types';

export interface PromptAnswerSettings {
  readonly ownerName: string | null;
}

const lapseDays = proposalLapseMs / (24 * 60 * 60 * 1000);

export function renderPromptProposalAnswer(
  detail: PromptProposalAnswerEvent,
  settings: PromptAnswerSettings,
): string {
  const owner = settings.ownerName ?? 'The owner';
  const proposal = `your prompt proposal ${detail.proposalID} (${detail.promptID})`;

  return match(detail.step)
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
    .with('exported', () => {
      invariant(detail.pullRequestURL !== null, 'an export record holds its pull request');

      return (
        `nixie opened ${detail.pullRequestURL} with ${proposal}. The override applies after ` +
        'that pull request merges and live is promoted in the definitions repo.'
      );
    })
    .with('rejected', () => {
      const line = `${owner} rejected ${proposal}.`;

      return detail.reason === null ? line : `${line} Reason: "${detail.reason}".`;
    })
    .exhaustive();
}
