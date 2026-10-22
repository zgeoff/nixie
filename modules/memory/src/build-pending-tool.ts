import type { Clock } from '@heynixie/clock';
import { formatAge } from '@heynixie/clock';
import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { match } from 'ts-pattern';
import type { MemoryProposal, MemoryProposals } from './gate-types';
import type { ItemIDStore, ProposalOrigin } from './types';

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
          change: { type: 'string', enum: ['new', 'edit', 'retire', 'pin'] },
          itemID: {
            type: 'string',
            description: 'the item an edit, a retirement or a pin names',
          },
          version: {
            type: 'integer',
            description: 'the version an edit, a retirement or a pin read',
          },
          text: {
            type: 'string',
            description:
              'the proposed text, the item a retirement drops, or the item a pin adds to the ' +
              'pinned core',
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

function pickChange(proposal: MemoryProposal): 'new' | 'edit' | 'retire' | 'pin' {
  return match(proposal.operation)
    .with('retire', () => 'retire' as const)
    .with('pin', () => 'pin' as const)
    .with('remember', () => (proposal.targetVersion === null ? 'new' : 'edit'))
    .exhaustive();
}

const notedByWords: Readonly<Record<ProposalOrigin, string>> = {
  conversation: 'you noted it',
  memory_writer: 'the note-taker noted it',
  task: 'a task noted it',
  owner: 'the owner noted it',
};

function buildNotedBy(proposal: MemoryProposal): readonly string[] {
  const origins = new Set(proposal.sources.map((source) => source.origin));

  return [...origins].map((origin) => notedByWords[origin]);
}
