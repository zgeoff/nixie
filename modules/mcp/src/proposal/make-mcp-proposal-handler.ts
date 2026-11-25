import { writeRecordsInTransaction } from '@heynixie/log';
import type { ProposalBody, ProposalKindHandler } from '@heynixie/proposals';
import { proposalLapseMs } from '@heynixie/proposals';
import invariant from 'tiny-invariant';
import { buildOperationHash } from '../operation/build-operation-hash';
import { mcpLapsedCodec } from '../record/mcp-lapsed-codec';
import type { McpOperation } from '../types';
import { answerMcpProposal } from './answer-mcp-proposal';
import type { AnswerContext } from './answer-mcp-proposal';
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

        const body = operation === null ? null : buildBody(operation);

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

function buildBody(operation: McpOperation): ProposalBody {
  if (operation.change === 'server') {
    return {
      sentence: `Connect to the MCP server ${operation.serverID}.`,
      fields: {
        url: operation.facts.url,
        scopes: operation.facts.scope,
        trusted: operation.facts.trusted ? 'yes' : 'no',
        ...(operation.facts.privateRange === null
          ? {}
          : { privateRange: operation.facts.privateRange }),
      },
      ruleSentence: null,
      approveLabel: 'Add the server',
    };
  }

  return {
    sentence: `Allow the tool ${operation.tool} in the form the server lists now.`,
    fields: {
      ...(operation.fromHash === null ? {} : { allowedForm: operation.fromHash }),
      newForm: operation.hash,
    },
    ruleSentence: null,
    approveLabel: 'Allow the tool',
  };
}
