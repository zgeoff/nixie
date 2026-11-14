import { readMessageTimeZone } from '@heynixie/connectors';
import type { ProposalBody, ProposalCoreDeps, SharedProposal } from '@heynixie/proposals';
import { pickProposalChoices, readOpenProposals } from '@heynixie/proposals';
import { collectOrderedRows, pickApprovalGroup } from './collect-ordered-rows';
import { toContractProposal } from './create-memory-proposal-procedures';
import { defaultApprovalSettings } from './default-api-settings';
import type { APIContext, ReadViewMemory } from './types';

// The open rows that have a handler and a body, in the digest's order.
export async function readApprovalItems(
  context: APIContext,
  deps: ProposalCoreDeps,
  readMemory: ReadViewMemory,
) {
  const db = context.log.writer.db;
  const approvals = context.settings.approvals ?? defaultApprovalSettings;

  const rows = await readOpenProposals(db, context.clock.now());
  const bodies = await readBodies(deps, rows);
  const memory = await readMemoryBodies(readMemory);

  const directory = new Map(context.settings.taskDirectory.map((task) => [task.taskID, task.name]));

  const items = rows.flatMap((row) => {
    const body = bodies.get(row.id);

    if (body === undefined || body === null) {
      return [];
    }

    const taskID = row.taskID ?? row.thread;

    return [
      {
        proposal: row,
        group: pickApprovalGroup(row),
        taskName: taskID === null ? null : (directory.get(taskID) ?? taskID),
        taskID,
        body: { ...body, ...(memory.has(row.id) ? { memory: memory.get(row.id) } : {}) },
      },
    ];
  });

  const messageZone = await readMessageTimeZone(context.log);

  return {
    defer: {
      defaultMinutes: approvals.defaultMinutes,
      eveningAt: approvals.eveningAt,
      morningAt: approvals.morningAt,
      zone: messageZone ?? approvals.defaultZone,
    },
    items: collectOrderedRows(items).map((item) => ({
      group: item.group,
      proposal: toContractRow(item.proposal),
      body: item.body,
      task: item.taskID === null ? null : { id: item.taskID, name: item.taskName ?? item.taskID },
      choices: [...pickProposalChoices(item.proposal)],
    })),
  };
}

async function readBodies(
  deps: ProposalCoreDeps,
  rows: readonly SharedProposal[],
): Promise<ReadonlyMap<string, ProposalBody | null>> {
  const bodies = new Map<string, ProposalBody | null>();

  for (const [family, handler] of deps.handlers) {
    const own = rows.filter((row) => row.family === family);

    for (const [id, body] of await handler.readBodies(deps.log.writer.db, own)) {
      bodies.set(id, body);
    }
  }

  return bodies;
}

async function readMemoryBodies(readMemory: ReadViewMemory) {
  const store = readMemory();

  if (store === null) {
    return new Map<string, ReturnType<typeof toContractProposal>>();
  }

  const proposals = await store.view.readProposals();

  return new Map(proposals.map((proposal) => [proposal.proposalID, toContractProposal(proposal)]));
}

function toContractRow(row: SharedProposal) {
  return {
    proposalID: row.id,
    shortID: row.shortID,
    kind: row.kind,
    riskClass: row.riskClass,
    actionHash: row.actionHash,
    ruleHash: row.ruleHash,
    cause: row.cause,
    state: row.state,
    createdAt: new Date(row.createdAt),
    lapsesAt: new Date(row.lapsesAt),
    deadlineAt: row.deadlineAt === null ? null : new Date(row.deadlineAt),
    deferGeneration: row.deferGeneration,
    deferUntil: row.deferUntil === null ? null : new Date(row.deferUntil),
  };
}
