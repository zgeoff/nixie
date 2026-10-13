import type { MemoryProposal } from './gate-types';
import type { BatchMessage } from './writer-types';

// One current item as the writer is shown it, with the version its change binds to.
export interface ShownItem {
  readonly itemID: string;
  readonly version: number;
  readonly text: string;
}

export interface WriterPromptInput {
  readonly items: readonly ShownItem[];

  // whether the items are every active item, or only those that matched the batch
  readonly isComplete: boolean;

  // the proposals that wait for the owner's review, whose facts the writer must not stage again
  readonly proposals: readonly ShownProposal[];
  readonly messages: readonly BatchMessage[];
}

export type ShownProposal = Pick<
  MemoryProposal,
  'proposalID' | 'operation' | 'itemID' | 'targetVersion' | 'text'
>;

// Renders the batch the writer reads: the current items, the pending proposals, then each message
// with its ID, its date and who wrote it, oldest first.
export function renderWriterPrompt(input: WriterPromptInput): string {
  const heading = input.isComplete
    ? 'Current memory items (the complete list):'
    : 'Current memory items that match this batch (not the complete list):';
  const items =
    input.items.length === 0
      ? '(none)'
      : input.items.map((item) => `- ${item.itemID}: ${item.text}`).join('\n');
  const messages = input.messages
    .map(
      (message) =>
        `[${String(message.sequence)}] ${formatDate(message.recordedAt)} ${message.role}: ${message.shown}`,
    )
    .join('\n\n');

  const proposals =
    input.proposals.length === 0
      ? '(none)'
      : input.proposals.map((proposal) => renderProposal(proposal)).join('\n');

  return `${heading}\n${items}\n\nPending proposals, waiting for the owner's review:\n${proposals}\n\nMessages in this batch:\n\n${messages}`;
}

// a proposal names the item it changes, so the writer reads it as that item's pending change
function renderProposal(proposal: ShownProposal): string {
  if (proposal.operation === 'retire') {
    return `- ${proposal.proposalID} (retires ${proposal.itemID}): ${proposal.text}`;
  }
  return proposal.targetVersion === null
    ? `- ${proposal.proposalID}: ${proposal.text}`
    : `- ${proposal.proposalID} (revises ${proposal.itemID}): ${proposal.text}`;
}

function formatDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}
