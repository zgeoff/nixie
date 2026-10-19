import type { MemoryProposal } from './gate-types';
import type { MemorySubject } from './types';
import type { BatchMessage } from './writer-types';

// One current item as the writer is shown it, with the version its change binds to.
export interface ShownItem {
  readonly itemID: string;
  readonly version: number;
  readonly subject: MemorySubject;
  readonly text: string;
}

export interface WriterPromptInput {
  readonly items: readonly ShownItem[];

  // whether the items are every active item, or only those that matched the batch
  readonly isComplete: boolean;

  // the proposals that wait for the owner's review, whose facts the writer must not stage again
  readonly proposals: readonly ShownProposal[];
  readonly messages: readonly BatchMessage[];

  // the names that label each message's author, or null for the bare role
  readonly names: SpeakerNames;
}

export interface SpeakerNames {
  readonly owner: string | null;
  readonly assistant: string | null;
}

type ShownProposal = Pick<
  MemoryProposal,
  'proposalID' | 'operation' | 'itemID' | 'targetVersion' | 'subject' | 'text'
>;

// Renders the batch the writer reads: the current items and the pending proposals, each with its
// subject, then each message with its ID, its date and who wrote it, oldest first. A message names
// its author by name and role, so "you" in your message reads as the assistant, never the writer.
export function renderWriterPrompt(input: WriterPromptInput): string {
  const heading = input.isComplete
    ? 'Current memory items (the complete list):'
    : 'Current memory items that match this batch (not the complete list):';

  const items =
    input.items.length === 0
      ? '(none)'
      : input.items.map((item) => `- ${item.itemID} (${item.subject}): ${item.text}`).join('\n');

  const messages = input.messages
    .map(
      (message) =>
        `[${String(message.sequence)}] ${formatDate(message.recordedAt)} ${formatSpeaker(input.names, message.role)}: ${message.shown}`,
    )
    .join('\n\n');

  const proposals =
    input.proposals.length === 0
      ? '(none)'
      : input.proposals.map((proposal) => renderProposal(proposal)).join('\n');

  return `${heading}\n${items}\n\nPending proposals, waiting for the owner's review:\n${proposals}\n\nMessages in this batch:\n\n${messages}`;
}

// A proposal names the item it changes, so the writer reads it as that item's pending change. Its
// text keeps to its one line, because outside content can reach a proposal's text.
function renderProposal(proposal: ShownProposal): string {
  const text = proposal.text.replaceAll(/\s+/gu, ' ');

  if (proposal.operation === 'retire') {
    return `- ${proposal.proposalID} (${proposal.subject}, retires ${proposal.itemID}): ${text}`;
  }

  return proposal.targetVersion === null
    ? `- ${proposal.proposalID} (${proposal.subject}): ${text}`
    : `- ${proposal.proposalID} (${proposal.subject}, revises ${proposal.itemID}): ${text}`;
}

function formatSpeaker(names: SpeakerNames, role: BatchMessage['role']): string {
  const name = names[role];

  return name === null ? role : `${name} (${role})`;
}

function formatDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}
