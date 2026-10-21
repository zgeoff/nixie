import type { MemoryProposal } from './gate-types';
import type { MemorySubject } from './types';
import type { BatchMessage } from './writer-types';

export interface ShownItem {
  readonly itemID: string;
  readonly version: number;
  readonly subject: MemorySubject;
  readonly text: string;
}

export interface SpeakerNames {
  readonly owner: string | null;
  readonly assistant: string | null;
}

type ShownProposal = Pick<
  MemoryProposal,
  'proposalID' | 'operation' | 'itemID' | 'targetVersion' | 'subject' | 'text'
>;

export interface WriterPromptInput {
  readonly items: readonly ShownItem[];

  readonly isComplete: boolean;

  readonly proposals: readonly ShownProposal[];
  readonly messages: readonly BatchMessage[];

  readonly names: SpeakerNames;
}

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

function formatDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function formatSpeaker(names: SpeakerNames, role: BatchMessage['role']): string {
  const name = names[role];

  return name === null ? role : `${name} (${role})`;
}

function renderProposal(proposal: ShownProposal): string {
  const text = proposal.text.replaceAll(/\s+/gu, ' ');

  if (proposal.operation === 'retire') {
    return `- ${proposal.proposalID} (${proposal.subject}, retires ${proposal.itemID}): ${text}`;
  }

  return proposal.targetVersion === null
    ? `- ${proposal.proposalID} (${proposal.subject}): ${text}`
    : `- ${proposal.proposalID} (${proposal.subject}, revises ${proposal.itemID}): ${text}`;
}
