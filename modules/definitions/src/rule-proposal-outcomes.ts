import type { RecordKind } from '@heynixie/log';
import { buildProposalOutcomes } from '@heynixie/proposals';
import type { ProposalOutcome } from '@heynixie/proposals';

export type RuleProposalOutcome = ProposalOutcome | 'withdrawn';

export const ruleProposalOutcomes: ReadonlyMap<RecordKind, RuleProposalOutcome> = new Map<
  RecordKind,
  RuleProposalOutcome
>([
  ...buildProposalOutcomes({
    approved: 'rules.change_approved',
    rejected: 'rules.change_rejected',
    lapsed: 'rules.change_lapsed',
  }),
  ['rules.change_withdrawn', 'withdrawn'],
]);
