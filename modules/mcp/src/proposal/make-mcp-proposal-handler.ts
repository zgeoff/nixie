import { findMcpToolOverride } from '@heynixie/policy';
import type { ProposalBody, ProposalKindHandler } from '@heynixie/proposals';
import { buildDiscardedOutcome } from '@heynixie/proposals';
import invariant from 'tiny-invariant';
import { pickActionHash } from '../operation/pick-action-hash';
import { readFormsByHash } from '../rows/read-forms-by-hash';
import type { McpOperation } from '../types';
import { answerMcpProposal } from './answer-mcp-proposal';
import type { AnswerContext } from './answer-mcp-proposal';
import { buildMcpProposalBody } from './build-mcp-proposal-body';
import { readOperation } from './read-operation';

const dayMs = 24 * 60 * 60 * 1000;

// The handler of the mcp family. It recomputes the operation from the facts and the tool's latest
// hash at each answer, so an answer from a card that showed older facts or an older form fails as
// a conflict.
export function makeMcpProposalHandler(context: AnswerContext): ProposalKindHandler {
  return {
    family: 'mcp',
    lapseIntervalMs: (config) => config.lapseDays.mcp * dayMs,
    ownsTransaction: false,
    readBodies: async (db, rows) => {
      const bodies = new Map<string, ProposalBody | null>();

      for (const row of rows) {
        const operation = await readOperation(db, row.id);
        const body = await readBody(context, operation);

        bodies.set(row.id, body);
      }

      return bodies;
    },
    readSentence: async (db, row) => {
      const operation = await readOperation(db, row.id);

      return operation === null
        ? null
        : buildMcpProposalBody(operation, { allowed: null, proposed: null }).sentence;
    },
    readHashes: async (db, row) => {
      const operation = await readOperation(db, row.id);

      const action =
        operation === null ? row.actionHash : pickActionHash(operation, row.actionHash);

      return { action, rule: null };
    },
    approve: (run, row, answer) => {
      invariant(run.tx, 'an mcp proposal answers in the transaction that the core opens');

      return answerMcpProposal(context, run.tx, { row, answer });
    },
    discard: (run, row, outcome, answer) => {
      if (outcome !== 'declined' || answer === null) {
        return Promise.resolve(buildDiscardedOutcome(row, outcome));
      }

      invariant(run.tx, 'an mcp proposal answers in the transaction that the core opens');

      return answerMcpProposal(context, run.tx, { row, answer });
    },
  };
}

// The card of an operation. An allow card shows the forms, read from the records that listed them.
async function readBody(
  context: AnswerContext,
  operation: McpOperation | null,
): Promise<ProposalBody | null> {
  if (operation === null) {
    return null;
  }

  if (operation.change === 'server') {
    return buildMcpProposalBody(operation, { allowed: null, proposed: null });
  }

  const found = await readFormsByHash(context.log, [
    ...(operation.fromHash === null ? [] : [operation.fromHash]),
    operation.hash,
  ]);

  const allowed =
    operation.fromHash === null ? null : (found.get(operation.fromHash)?.form ?? null);

  const proposed = found.get(operation.hash)?.form ?? null;

  const overrides = await context.readOverrides?.(context.log.writer.db);

  const serverID = operation.tool.split('.')[0] ?? '';

  const override =
    proposed === null || overrides === undefined
      ? null
      : findMcpToolOverride(overrides.servers, serverID, proposed.name);

  return buildMcpProposalBody(operation, { allowed, proposed, override });
}
