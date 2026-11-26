import type { JSONObject } from '@heynixie/log';
import type { MemoryProposal } from '@heynixie/memory';
import type { ProposalFamily, SharedProposal } from '@heynixie/proposals';
import { readOpenProposals } from '@heynixie/proposals';
import type { ToolDefinition } from '@heynixie/tools';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { readProposers } from './read-proposers';
import type { ProposalsToolDeps } from './types';

const families = ['action', 'memory', 'skill', 'rule_change', 'mcp', 'prompt'] as const;

const inputSchema = z.object({
  by: z.enum(['me', 'tasks']).optional(),
  family: z.enum(families).optional(),
  text: z.boolean().optional(),
});

const pendingOutput = {
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          shortID: { type: 'string' },
          family: { type: 'string', enum: [...families] },
          task: { type: ['string', 'null'], description: 'the proposing task; null for yours' },
          state: { type: 'string', enum: ['pending', 'deferred'] },
          lapsesAt: { type: 'string' },
          change: { type: 'string', enum: ['add', 'edit', 'retire', 'pin'] },
          gist: { type: ['string', 'null'] },
          topic: { type: ['string', 'null'] },
          reason: { type: 'string', description: 'why a memory proposal waits for review' },
          text: { type: 'string', description: 'the proposed text of a memory proposal' },
          sentence: { type: 'string', description: 'the one line the owner reads on the card' },
        },
        required: ['shortID', 'family', 'task', 'state', 'lapsesAt'],
      },
    },
  },
  required: ['proposals'],
  additionalProperties: false,
};

export function buildProposalsPendingTool(deps: ProposalsToolDeps): ToolDefinition {
  return {
    name: 'proposals.pending',
    description:
      "Lists the proposals that still wait for the owner's review: yours, and those of every task " +
      'you started. Each row has its ID, its family, the task that made it and when it lapses. A ' +
      'memory row shows its change, gist, topic and why it waits; pass text to add its full ' +
      'text. Read it before you propose, so you never propose what already waits. Only the owner ' +
      'approves or declines a proposal.',
    input: {
      type: 'object',
      properties: {
        by: {
          type: 'string',
          enum: ['me', 'tasks'],
          description: 'me lists your own, tasks lists those of the tasks you started',
        },
        family: { type: 'string', enum: [...families] },
        text: { type: 'boolean', description: 'add the full proposed text to memory rows' },
      },
      additionalProperties: false,
    },
    output: pendingOutput,
    declaration: {
      effects: ['read'],
      destinations: [],
      amount: null,
      content: [],
      results: { proposals: 'untrusted' },
    },
    execution: 'direct',
    run: async (call, context) => {
      const input = inputSchema.parse(call.input);
      const caller = context.run.thread;
      const db = deps.log.writer.db;

      const open = await readOpenProposals(db, deps.clock.now());
      const proposers = await readProposers(db, caller);

      const own = (row: SharedProposal) =>
        !proposers.leftProposalIDs.has(row.id) &&
        (row.thread === caller || proposers.mergedProposalIDs.has(row.id));

      const ofTasks = (row: SharedProposal) =>
        !own(row) &&
        ((row.thread !== null && proposers.startedTaskIDs.has(row.thread)) ||
          proposers.taskMergedProposalIDs.has(row.id));

      const listed = open.filter(
        (row) =>
          (input.family === undefined || row.family === input.family) &&
          match(input.by)
            .with('me', () => own(row))
            .with('tasks', () => ofTasks(row))
            .with(undefined, () => own(row) || ofTasks(row))
            .exhaustive(),
      );

      const names = await deps.readTaskNames();
      const memory = await readMemoryRows(deps, listed);
      const sentences = await readSentences(deps, listed);

      const proposals = listed.map((row): JSONObject => {
        const task = row.thread === null || row.thread === caller ? null : row.thread;

        const shared = {
          shortID: row.shortID,
          family: row.family,
          task: task === null ? null : (names.get(task) ?? task),
          state: row.state === 'deferred' ? 'deferred' : 'pending',
          lapsesAt: new Date(row.lapsesAt).toISOString(),
        };

        const proposal = memory.get(row.id);

        if (row.family === 'memory' && proposal !== undefined) {
          return {
            ...shared,
            ...readMemoryFields(deps, proposal, input.text === true),
          };
        }

        return { ...shared, sentence: sentences.get(row.id) ?? `A ${row.family} proposal` };
      });

      return {
        status: 'ok',
        result: { proposals },
        record: { proposals: listed.map((row) => ({ shortID: row.shortID })) },
      };
    },
  };
}

async function readMemoryRows(
  deps: ProposalsToolDeps,
  rows: readonly SharedProposal[],
): Promise<ReadonlyMap<string, MemoryProposal>> {
  const store = deps.readMemory();

  if (store === null || !rows.some((row) => row.family === 'memory')) {
    return new Map();
  }

  const pending = await store.proposals.listPending();

  return new Map(pending.map((proposal) => [proposal.proposalID, proposal]));
}

async function readSentences(
  deps: ProposalsToolDeps,
  rows: readonly SharedProposal[],
): Promise<ReadonlyMap<string, string>> {
  const core = deps.readCore();

  const sentences = new Map<string, string>();

  for (const family of new Set<ProposalFamily>(rows.map((row) => row.family))) {
    const handler = core.handlers.get(family);
    const own = rows.filter((row) => row.family === family);

    if (handler === undefined || family === 'memory') {
      continue;
    }

    for (const [id, body] of await handler.readBodies(deps.log.writer.db, own)) {
      if (body !== null) {
        sentences.set(id, body.sentence);
      }
    }
  }

  return sentences;
}

function readMemoryFields(
  deps: ProposalsToolDeps,
  proposal: MemoryProposal,
  isTextShown: boolean,
): JSONObject {
  const change = match(proposal.operation)
    .with('retire', () => 'retire')
    .with('pin', () => 'pin')
    .with('remember', () => (proposal.targetVersion === null ? 'add' : 'edit'))
    .exhaustive();

  return {
    change,
    gist: proposal.labels?.gist ?? null,
    topic: proposal.labels?.topic ?? null,
    reason: deps.readMemory()?.renderReviewReason(proposal.reason) ?? '',
    ...(isTextShown && proposal.labels?.isLabelOnly !== true ? { text: proposal.text } : {}),
  };
}
