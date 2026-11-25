import { writeRecordsInTransaction } from '@heynixie/log';
import type { ProposalBody, ProposalKindHandler } from '@heynixie/proposals';
import { proposalLapseMs } from '@heynixie/proposals';
import invariant from 'tiny-invariant';
import { buildOperationHash } from '../operation/build-operation-hash';
import { mcpLapsedCodec } from '../record/mcp-lapsed-codec';
import { readFormsByHash } from '../rows/read-forms-by-hash';
import type { McpOperation } from '../types';
import { answerMcpProposal } from './answer-mcp-proposal';
import type { AnswerContext } from './answer-mcp-proposal';
import { buildMcpProposalBody } from './build-mcp-proposal-body';
import { readOperation } from './read-operation';

// The handler of the mcp family. It recomputes the operation from the facts and the tool's latest
// hash at each answer, so an answer from a card that showed older facts or an older form fails as
// a conflict.
export function makeMcpProposalHandler(context: AnswerContext): ProposalKindHandler {
  return {
    family: 'mcp',
    lapseIntervalMs: proposalLapseMs,
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
    readHashes: async (db, row) => {
      const operation = await readOperation(db, row.id);

      const action = operation === null ? row.actionHash : buildOperationHash(operation);

      return { action, rule: null };
    },
    approve: (run, row, answer) => {
      invariant(run.tx, 'an mcp proposal answers in the transaction that the core opens');

      return answerMcpProposal(context, run.tx, { row, answer });
    },
    decline: (run, row, answer) => {
      invariant(run.tx, 'an mcp proposal answers in the transaction that the core opens');

      return answerMcpProposal(context, run.tx, { row, answer });
    },
    lapse: async (tx, row) => {
      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: mcpLapsedCodec.kind,
          definitions: context.definitions(),
          payload: mcpLapsedCodec.encode({ proposalID: row.id }),
        },
      ]);
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

  return buildMcpProposalBody(operation, {
    allowed,
    proposed,
    override: proposed === null ? null : (overrides?.servers[serverID]?.[proposed.name] ?? null),
  });
}
