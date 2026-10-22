import { match } from 'ts-pattern';
import { formatZonedTime } from './format-zoned-time';
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

  readonly defaultZone: string;
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
        `[${String(message.sequence)}] ${formatZonedTime(message.recordedAt, message.timeZone ?? input.defaultZone)} ${formatSpeaker(input.names, message.role)}: ${message.shown}`,
    )
    .join('\n\n');

  const proposals =
    input.proposals.length === 0
      ? '(none)'
      : input.proposals.map((proposal) => renderProposal(proposal)).join('\n');

  return `${heading}\n${items}\n\nPending proposals, waiting for the owner's review:\n${proposals}\n\nMessages in this batch:\n\n${messages}`;
}

function formatSpeaker(names: SpeakerNames, role: BatchMessage['role']): string {
  const name = names[role];

  return name === null ? role : `${name} (${role})`;
}

function renderProposal(proposal: ShownProposal): string {
  const text = proposal.text.replaceAll(/\s+/gu, ' ');

  const action = match(proposal.operation)
    .with('retire', () => `, retires ${proposal.itemID}`)
    .with('pin', () => `, pins ${proposal.itemID}`)
    .with('remember', () => (proposal.targetVersion === null ? '' : `, revises ${proposal.itemID}`))
    .exhaustive();

  return `- ${proposal.proposalID} (${proposal.subject}${action}): ${text}`;
}
