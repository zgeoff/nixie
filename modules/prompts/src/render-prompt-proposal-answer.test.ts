import { expect, test } from 'bun:test';
import { renderPromptProposalAnswer } from './render-prompt-proposal-answer';

test('it tells the model an approval opens a pull request, and the override applies once it merges and live is promoted', () => {
  expect(
    renderPromptProposalAnswer(
      {
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        step: 'approved',
        isEdited: false,
        pullRequestURL: null,
        reason: null,
      },
      { ownerName: 'Robin' },
    ),
  ).toBe(
    'Robin approved your prompt proposal k3x9m2p7qa (compaction). nixie opens a pull request to the definitions repo with it, and the override applies only after that pull request merges and live is promoted.',
  );
});

test('it names the pull request an export opened, and says the override applies once it merges and live is promoted', () => {
  expect(
    renderPromptProposalAnswer(
      {
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        step: 'exported',
        isEdited: false,
        pullRequestURL: 'https://definitions.test/pull/4',
        reason: null,
      },
      { ownerName: 'Robin' },
    ),
  ).toBe(
    'nixie opened https://definitions.test/pull/4 with your prompt proposal k3x9m2p7qa (compaction). The override applies after that pull request merges and live is promoted in the definitions repo.',
  );
});

test('it names an approval with edits', () => {
  expect(
    renderPromptProposalAnswer(
      {
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        step: 'approved',
        isEdited: true,
        pullRequestURL: null,
        reason: null,
      },
      { ownerName: null },
    ),
  ).toStartWith('The owner approved your prompt proposal k3x9m2p7qa (compaction) with edits. ');
});

test('it gives the reason for a rejection', () => {
  expect(
    renderPromptProposalAnswer(
      {
        proposalID: 'k3x9m2p7qa',
        promptID: 'writer',
        step: 'rejected',
        isEdited: false,
        pullRequestURL: null,
        reason: 'Keep the quote rule.',
      },
      { ownerName: 'Robin' },
    ),
  ).toBe(
    'Robin rejected your prompt proposal k3x9m2p7qa (writer). Reason: "Keep the quote rule.".',
  );
});

test('it names a rejection without a reason it can read', () => {
  expect(
    renderPromptProposalAnswer(
      {
        proposalID: 'k3x9m2p7qa',
        promptID: 'writer',
        step: 'rejected',
        isEdited: false,
        pullRequestURL: null,
        reason: null,
      },
      { ownerName: 'Robin' },
    ),
  ).toBe('Robin rejected your prompt proposal k3x9m2p7qa (writer).');
});

test('it tells the model a proposal lapsed after 14 days with no answer', () => {
  expect(
    renderPromptProposalAnswer(
      {
        proposalID: 'k3x9m2p7qa',
        promptID: 'session',
        step: 'lapsed',
        isEdited: false,
        pullRequestURL: null,
        reason: null,
      },
      { ownerName: 'Robin' },
    ),
  ).toBe('Your prompt proposal k3x9m2p7qa (session) lapsed after 14 days with no answer.');
});
