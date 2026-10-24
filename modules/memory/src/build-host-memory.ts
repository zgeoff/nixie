import type { MemorySubjectCounts } from '@heynixie/db';
import type { ChangeOutcome, ConsolidationDiff, MemoryConsolidations } from './consolidation-types';
import type { ApprovalResult, MemoryProposal, MemoryProposals } from './gate-types';
import type { MemoryStore, Provenance, VersionRef } from './types';
import type { ItemHistory } from './view-types';

export type HostMemoryStore = Pick<
  MemoryStore,
  | 'remember'
  | 'retire'
  | 'restore'
  | 'pin'
  | 'forget'
  | 'forgetAll'
  | 'readHistory'
  | 'readSubjectCounts'
> & { readonly proposals: MemoryProposals; readonly consolidations: MemoryConsolidations };

interface HostAnswer {
  readonly actionHash: string;
}

interface HostApproval extends HostAnswer {
  readonly proposalID: string;

  readonly revisionOf?: VersionRef;
  readonly ignoreCloseMatch?: boolean;

  readonly editedText?: string;
}

interface HostRejection extends HostAnswer {
  readonly proposalID: string;

  readonly reason?: string;
}

interface HostChangeAnswer extends HostAnswer {
  readonly changeID: string;
}

export interface HostMemory {
  readonly listProposals: () => Promise<readonly MemoryProposal[]>;
  readonly approveProposal: (approval: HostApproval) => Promise<ApprovalResult>;
  readonly rejectProposal: (rejection: HostRejection) => Promise<void>;
  readonly readHistory: (itemID: string) => Promise<ItemHistory | null>;
  readonly edit: (target: VersionRef, text: string) => Promise<VersionRef>;
  readonly retire: (target: VersionRef) => Promise<VersionRef>;
  readonly restore: (target: VersionRef) => Promise<VersionRef>;
  readonly pin: (itemID: string, isPinned: boolean) => Promise<void>;

  readonly forget: (target: VersionRef) => Promise<void>;

  readonly forgetAll: () => Promise<readonly string[]>;
  readonly readDiff: () => Promise<ConsolidationDiff | null>;
  readonly approveChanges: (
    answers: readonly HostChangeAnswer[],
  ) => Promise<readonly ChangeOutcome[]>;
  readonly rejectChange: (answer: HostChangeAnswer) => Promise<void>;
  readonly readSubjectCounts: () => Promise<MemorySubjectCounts>;
}

const hostIdentityID = 'host';

const ownerProvenance: Provenance = {
  origin: 'owner',
  source: 'owner',
  taskID: null,
  proposalID: null,
  checks: null,
  model: null,
};

export function buildHostMemory(store: HostMemoryStore): HostMemory {
  return {
    listProposals: () => store.proposals.listPending(),
    approveProposal: (approval) =>
      store.proposals.approve({ ...approval, identityID: hostIdentityID }),
    rejectProposal: (rejection) =>
      store.proposals.reject({ ...rejection, identityID: hostIdentityID }),
    readHistory: (itemID) => store.readHistory(itemID),
    edit: (target, text) => store.remember({ text, target, provenance: ownerProvenance }),
    retire: (target) => store.retire({ target, provenance: ownerProvenance }),
    restore: (target) => store.restore({ target, provenance: ownerProvenance }),
    pin: (itemID, isPinned) => store.pin({ itemID, isPinned, provenance: ownerProvenance }),
    forget: (target) => store.forget({ target, provenance: ownerProvenance }),
    forgetAll: () => store.forgetAll({ provenance: ownerProvenance }),
    readDiff: () => store.consolidations.readPending(),
    approveChanges: (answers) =>
      store.consolidations.approveAll(
        answers.map((answer) => ({ ...answer, identityID: hostIdentityID })),
      ),
    rejectChange: (answer) =>
      store.consolidations.reject({ ...answer, identityID: hostIdentityID }),
    readSubjectCounts: () => store.readSubjectCounts(),
  };
}
