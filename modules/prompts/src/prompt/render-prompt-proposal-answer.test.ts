import { expect, test } from 'bun:test';
import { renderPromptProposalAnswer } from './render-prompt-proposal-answer';

test('it names the pull request an export opened, and says the override applies once it merges and live is promoted', () => {
  expect(
    renderPromptProposalAnswer({
      proposalID: 'k3x9m2p7qa',
      promptID: 'compaction',
      step: 'exported',
      isEdited: false,
      pullRequestURL: 'https://definitions.test/pull/4',
      reason: null,
    }),
  ).toBe(
    'nixie opened https://definitions.test/pull/4 with your prompt proposal k3x9m2p7qa (compaction). The override applies after that pull request merges and live is promoted in the definitions repo.',
  );
});
