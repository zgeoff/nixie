import type { Clock } from '@heynixie/clock';
import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import type { MemoryProposal, MemoryProposals } from './gate-types';
import type { ItemIDStore, MemoryOrigin } from './types';

// What memory.pending reads: the proposals that wait for the owner's review.
export interface PendingToolStore extends Pick<ItemIDStore, 'readShortIDs'> {
  readonly proposals: Pick<MemoryProposals, 'listPending'>;
}

const pendingOutput = {
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          proposalID: { type: 'string' },
          change: { type: 'string', enum: ['new', 'edit', 'retire'] },
          itemID: { type: 'string', description: 'the item an edit or a retirement names' },
          version: { type: 'integer', description: 'the version an edit or a retirement read' },
          text: {
            type: 'string',
            description: 'the proposed text, or the item a retirement drops',
          },
          notedBy: {
            type: 'array',
            items: { type: 'string' },
            description: 'who noted it, the first proposer then each who proposed it again',
          },
          subject: {
            type: 'string',
            enum: ['owner', 'self', 'shared'],
            description:
              'owner for a fact about the owner, shared for something between the owner and you, ' +
              'self for a self-note about yourself',
          },
          reason: { type: 'string', description: 'why it waits for review' },
          age: { type: 'string', description: 'how long it has waited, such as 3 days' },
        },
        required: ['proposalID', 'change', 'text', 'notedBy', 'subject', 'reason', 'age'],
      },
    },
  },
  required: ['proposals'],
  additionalProperties: false,
};

// Builds memory.pending, which declares read and lists every memory proposal that still waits for
// the owner's review, the conversation's own and the note-taker's, oldest first. It never answers
// one. The proposals hold every source a write can quote, so the result takes the most cautious.
export function buildPendingTool(
  memory: PendingToolStore,
  clock: Pick<Clock, 'now'>,
): ToolDefinition {
  return {
    name: 'memory.pending',
    description:
      "Lists every memory proposal that still waits for the owner's review, yours and the " +
      "note-taker's, oldest first: its ID, the proposed text, who noted it, why it waits and how " +
      'long it has waited. Read it before you propose a memory, so you never propose one that ' +
      'already waits, and whenever you need to know what is still unanswered. Only the owner ' +
      'approves or rejects a proposal.',
    input: { type: 'object', properties: {}, additionalProperties: false },
    output: pendingOutput,
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { proposals: 'untrusted' },
    },
    execution: 'direct',
    run: async () => {
      const proposals = await memory.proposals.listPending();

      const shortIDs = await memory.readShortIDs(
        proposals.flatMap((proposal) => (proposal.targetVersion === null ? [] : [proposal.itemID])),
      );

      const now = clock.now();

      // the record holds only the proposal IDs, so a forget leaves no readable copy of the text
      return {
        status: 'ok',
        result: {
          proposals: proposals.map((proposal) =>
            toPendingJSON(proposal, shortIDs.get(proposal.itemID) ?? proposal.itemID, now),
          ),
        },
        record: { proposals: proposals.map((proposal) => ({ proposalID: proposal.proposalID })) },
      };
    },
  };
}

// the proposal as the model reads it, with the item an edit or a retirement names by its short ID
function toPendingJSON(proposal: MemoryProposal, shortID: string, now: number): JSONObject {
  return {
    proposalID: proposal.proposalID,
    change: pickChange(proposal),
    ...(proposal.targetVersion === null
      ? {}
      : { itemID: shortID, version: proposal.targetVersion }),
    text: proposal.text,
    notedBy: buildNotedBy(proposal),
    subject: proposal.subject,
    reason: proposal.reason,
    age: formatAge(now - proposal.createdAt),
  };
}

function pickChange(proposal: MemoryProposal): 'new' | 'edit' | 'retire' {
  if (proposal.operation === 'retire') {
    return 'retire';
  }

  return proposal.targetVersion === null ? 'new' : 'edit';
}

// each origin that proposed it once, in the order it first proposed it
function buildNotedBy(proposal: MemoryProposal): readonly string[] {
  const origins = new Set(proposal.sources.map((source) => source.origin));

  return [...origins].map((origin) => notedByWords[origin]);
}

// the words the model reads for who noted a memory: the conversation is the model itself
const notedByWords: Readonly<Record<MemoryOrigin, string>> = {
  conversation: 'you noted it',
  memory_writer: 'the note-taker noted it',
  task: 'a task noted it',
  owner: 'the owner noted it',
};

// a whole number of the largest unit that fits, such as 3 days, or under a minute
function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);

  if (minutes < 1) {
    return 'under a minute';
  }

  if (minutes < 60) {
    return formatCount(minutes, 'minute');
  }

  const hours = Math.floor(minutes / 60);

  return hours < 24 ? formatCount(hours, 'hour') : formatCount(Math.floor(hours / 24), 'day');
}

function formatCount(count: number, unit: string): string {
  return `${String(count)} ${unit}${count === 1 ? '' : 's'}`;
}
