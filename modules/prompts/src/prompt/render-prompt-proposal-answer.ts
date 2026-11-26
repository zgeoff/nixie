import invariant from 'tiny-invariant';
import type { PromptProposalAnswerEvent } from '../types';

export function renderPromptProposalAnswer(detail: PromptProposalAnswerEvent): string {
  const proposal = `your prompt proposal ${detail.proposalID} (${detail.promptID})`;

  invariant(detail.pullRequestURL !== null, 'an export record holds its pull request');

  return (
    `nixie opened ${detail.pullRequestURL} with ${proposal}. The override applies after ` +
    'that pull request merges and live is promoted in the definitions repo.'
  );
}
