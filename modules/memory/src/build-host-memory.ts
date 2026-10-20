import type { MemorySubjectCounts } from '@heynixie/db';
import type { ChangeOutcome, ConsolidationDiff, MemoryConsolidations } from './consolidation-types';
import type { ApprovalResult, MemoryProposal, MemoryProposals } from './gate-types';
import type { MemoryStore, Provenance, VersionRef } from './types';
import type { ItemHistory } from './view-types';

// What the host commands reach of the memory store: the pending proposals, the consolidator's
// diff, and your own changes to an item, its forget included.
export type HostMemoryStore = Pick<
  MemoryStore,
  'remember' | 'retire' | 'restore' | 'pin' | 'forget' | 'readHistory' | 'readSubjectCounts'
> & { readonly proposals: MemoryProposals; readonly consolidations: MemoryConsolidations };

// An answer to a proposal or a change, bound to the action hash the host command showed.
interface HostAnswer {
  readonly actionHash: string;
}

interface HostApproval extends HostAnswer {
  readonly proposalID: string;

  // an approval's answer to a close match: a revision of that item, or a new item anyway
  readonly revisionOf?: VersionRef;
  readonly ignoreCloseMatch?: boolean;

  // edited text replaces the proposal's, and makes you the approved version's origin
  readonly editedText?: string;
}

interface HostRejection extends HostAnswer {
  readonly proposalID: string;

  // the reason the conversation reads in its next turn
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

  // forgets the item for good, bound to the version memory-show printed; a forget whose cleanup
  // failed stays pending, and the store's next start completes it
  readonly forget: (target: VersionRef) => Promise<void>;
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

// The memory store as the host commands reach it. An answer comes from a shell in nixie's
// container, which no device session reaches, so its record names the host as the identity that
// answered. A change to an item is your own action, as in the memory view, with your provenance.
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
