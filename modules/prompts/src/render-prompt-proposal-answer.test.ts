import { expect, test } from 'bun:test';
import { renderPromptProposalAnswer } from './render-prompt-proposal-answer';

test('it tells the model an approval opens a pull request, and the override applies once it merges and live is promoted', () => {
  expect(
    renderPromptProposalAnswer(
      {
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        outcome: 'approved',
        isEdited: false,
        reason: null,
      },
      { ownerName: 'Robin' },
    ),
  ).toBe(
    'Robin approved your prompt proposal k3x9m2p7qa (compaction). nixie opens a pull request to the definitions repo with it, and the override applies only after that pull request merges and live is promoted.',
  );
});

test('it names an approval with edits', () => {
  expect(
    renderPromptProposalAnswer(
      {
        proposalID: 'k3x9m2p7qa',
        promptID: 'compaction',
        outcome: 'approved',
        isEdited: true,
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
        outcome: 'rejected',
        isEdited: false,
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
        outcome: 'rejected',
        isEdited: false,
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
        outcome: 'lapsed',
        isEdited: false,
        reason: null,
      },
      { ownerName: 'Robin' },
    ),
  ).toBe('Your prompt proposal k3x9m2p7qa (session) lapsed after 14 days with no answer.');
});
