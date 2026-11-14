import type { CheckedTables } from '@heynixie/db';

export type ProposalFamily = 'action' | 'memory' | 'skill' | 'rule_change';

export type ProposalKind = 'action' | 'memory_write' | 'internal_change';

export type ProposalRiskClass = 'routine' | 'always_ask' | 'lifting';

export type SharedProposalState =
  | 'pending'
  | 'deferred'
  | 'approved'
  | 'declined'
  | 'lapsed'
  | 'withdrawn';

export type ProposalTables = CheckedTables<
  Readonly<{
    proposals: {
      readonly proposal_id: string;
      readonly short_id: string;
      readonly family: ProposalFamily;
      readonly kind: ProposalKind;
      readonly risk_class: ProposalRiskClass;
      readonly action_hash: string;
      readonly rule_hash: string | null;
      readonly cause: string;
      readonly task_id: string | null;
      readonly thread: string | null;
      readonly created_sequence: number;
      readonly created_at: number;
      readonly lapses_at: number;
      readonly deadline_at: number | null;
      readonly state: SharedProposalState;
      readonly used_by: string | null;
      readonly defer_generation: number;
      readonly defer_until: number | null;
      readonly return_at: number | null;
    };
  }>
>;
