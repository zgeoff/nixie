import { expect, test } from 'bun:test';
import { buildRuleProposal } from './build-rule-proposal';
import { pickRuleProposalMove } from './pick-rule-proposal-move';
import type { RuleProposalOutcome } from './rule-proposal-outcomes';
import type { RuleProposalRefusal } from './write-rule-proposal-answer';

interface RefusalCase {
  readonly label: string;
  readonly proposalID: string;
  readonly outcome: RuleProposalOutcome | null;
  readonly lapseAt: number;
  readonly seeded: readonly [string, string][];
  readonly code: RuleProposalRefusal;
}

test.each<RefusalCase>([
  {
    label: 'an unknown proposal',
    proposalID: 'p-other',
    outcome: null,
    lapseAt: 1000,
    seeded: [],
    code: 'NOT_FOUND',
  },
  {
    label: 'a withdrawn proposal',
    proposalID: 'p-web',
    outcome: 'withdrawn',
    lapseAt: 1000,
    seeded: [],
    code: 'PROPOSAL_CLOSED',
  },
  {
    label: 'a rejected proposal',
    proposalID: 'p-web',
    outcome: 'rejected',
    lapseAt: 1000,
    seeded: [],
    code: 'PROPOSAL_CLOSED',
  },
  {
    label: 'a proposal past its lapse time',
    proposalID: 'p-web',
    outcome: null,
    lapseAt: 0,
    seeded: [],
    code: 'PROPOSAL_CLOSED',
  },
])('it refuses an approval of $label', (refusal) => {
  const proposal = buildRuleProposal(
    'p-web',
    [
      {
        ruleID: 'allow-web',
        before: null,
        after: { hash: 'h-web', rule: { id: 'allow-web', outcome: 'allow', tools: ['web.fetch'] } },
        change: 'widening',
      },
    ],
    [],
  );

  const move = pickRuleProposalMove({
    proposals: [
      { proposal, proposedAt: -1000, lapseAt: refusal.lapseAt, outcome: refusal.outcome },
    ],
    answer: { answer: 'approve', proposalID: refusal.proposalID },
    seeded: new Map(refusal.seeded),
    now: 0,
  });

  expect(move).toStrictEqual({
    status: 'refused',
    code: refusal.code,
    reason: expect.any(String),
  });
});

test('it approves a pending proposal while the seeded rules hold its versions from before', () => {
  const proposal = buildRuleProposal(
    'p-web',
    [
      {
        ruleID: 'allow-web',
        before: null,
        after: { hash: 'h-web', rule: { id: 'allow-web', outcome: 'allow', tools: ['web.fetch'] } },
        change: 'widening',
      },
    ],
    [],
  );

  const move = pickRuleProposalMove({
    proposals: [{ proposal, proposedAt: 0, lapseAt: 1000, outcome: null }],
    answer: { answer: 'approve', proposalID: 'p-web' },
    seeded: new Map(),
    now: 0,
  });

  expect(move).toStrictEqual({ status: 'approved', proposal });
});

test('it approves a proposal a defer kept open past its first lapse time', () => {
  const proposal = buildRuleProposal(
    'p-web',
    [
      {
        ruleID: 'allow-web',
        before: null,
        after: { hash: 'h-web', rule: { id: 'allow-web', outcome: 'allow', tools: ['web.fetch'] } },
        change: 'widening',
      },
    ],
    [],
  );

  const move = pickRuleProposalMove({
    proposals: [
      {
        proposal,
        proposedAt: Date.UTC(2026, 0, 1),
        lapseAt: Date.UTC(2026, 0, 21),
        outcome: null,
      },
    ],
    answer: { answer: 'approve', proposalID: 'p-web' },
    seeded: new Map(),
    now: Date.UTC(2026, 0, 16),
  });

  expect(move).toStrictEqual({ status: 'approved', proposal });
});

test('it rejects a pending proposal with your reason', () => {
  const proposal = buildRuleProposal(
    'p-web',
    [
      {
        ruleID: 'allow-web',
        before: null,
        after: { hash: 'h-web', rule: { id: 'allow-web', outcome: 'allow', tools: ['web.fetch'] } },
        change: 'widening',
      },
    ],
    [],
  );

  const move = pickRuleProposalMove({
    proposals: [{ proposal, proposedAt: 0, lapseAt: 1000, outcome: null }],
    answer: { answer: 'reject', proposalID: 'p-web', reason: 'Not this week.' },
    seeded: new Map([['allow-web', 'h-web-read']]),
    now: 0,
  });

  expect(move).toStrictEqual({ status: 'rejected', proposal, reason: 'Not this week.' });
});
