import type { MemorySubjectCounts } from '@heynixie/db';
import type { ApprovalResult, MemoryProposal, MemoryProposals } from '../gate/gate-context';
import type { ForgetStatus, MemoryStore, Provenance, VersionRef } from '../types';
import { TextLimitError } from '../utils/error/text-limit-error';
import type { ItemHistory } from '../view/memory-view';
import { findTextLimitError } from '../write/find-text-limit-error';

export type HostMemoryStore = Pick<
  MemoryStore,
  | 'remember'
  | 'retire'
  | 'restore'
  | 'pin'
  | 'forget'
  | 'forgetAll'
  | 'finishForgets'
  | 'readHistory'
  | 'readSubjectCounts'
> & { readonly proposals: MemoryProposals };

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

export interface HostMemory {
  readonly listProposals: () => Promise<readonly MemoryProposal[]>;
  readonly approveProposal: (approval: HostApproval) => Promise<ApprovalResult>;
  readonly rejectProposal: (rejection: HostRejection) => Promise<void>;
  readonly readHistory: (itemID: string) => Promise<ItemHistory | null>;
  readonly edit: (target: VersionRef, text: string) => Promise<VersionRef>;
  readonly retire: (target: VersionRef) => Promise<VersionRef>;
  readonly restore: (target: VersionRef) => Promise<VersionRef>;
  readonly pin: (itemID: string, isPinned: boolean) => Promise<void>;

  readonly forget: (target: VersionRef) => Promise<ForgetStatus>;

  readonly forgetAll: () => Promise<ForgetStatus>;
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
    edit: async (target, text) => {
      const history = await store.readHistory(target.itemID);

      const limitError = findTextLimitError(text, history?.subject ?? 'owner');

      if (limitError !== null) {
        throw new TextLimitError(limitError);
      }

      return store.remember({ text, target, provenance: ownerProvenance });
    },
    retire: (target) => store.retire({ target, provenance: ownerProvenance }),
    restore: (target) => store.restore({ target, provenance: ownerProvenance }),
    pin: (itemID, isPinned) => store.pin({ itemID, isPinned, provenance: ownerProvenance }),
    forget: async (target) => {
      await store.forget({ target, provenance: ownerProvenance });

      return store.finishForgets([target.itemID]);
    },
    forgetAll: async () => {
      const itemIDs = await store.forgetAll({ provenance: ownerProvenance });

      return store.finishForgets(itemIDs);
    },
    readSubjectCounts: () => store.readSubjectCounts(),
  };
}
