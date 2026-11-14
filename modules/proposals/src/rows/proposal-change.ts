import type { EnvelopeRecord } from '@heynixie/log';
import type { ProposalFamily, ProposalKind, ProposalRiskClass } from './proposal-tables';

export interface NewProposal {
  readonly id: string;
  readonly shortID: string;
  readonly family: ProposalFamily;
  readonly kind: ProposalKind;
  readonly riskClass: ProposalRiskClass;
  readonly actionHash: string;
  readonly ruleHash: string | null;
  readonly cause: string;
  readonly taskID: string | null;
  readonly lapsesAt: number;
  readonly deadlineAt: number | null;
}

export type ClosedProposalState = 'approved' | 'declined' | 'lapsed' | 'withdrawn';

export type ProposalChange =
  | { readonly type: 'create'; readonly proposal: NewProposal }
  | {
      readonly type: 'close';
      readonly proposalID: string;
      readonly state: ClosedProposalState;
      readonly usedBy: string | null;
    }
  | { readonly type: 'extend'; readonly proposalID: string; readonly lapsesAt: number };

// A kind module reads its own record payloads and says what each means for the shared row.
export type ProposalRecordMapper = (record: EnvelopeRecord) => ProposalChange | null;
