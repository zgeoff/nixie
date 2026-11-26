import { withWriteTransaction } from '@heynixie/log';
import { readMergedThreads } from '@heynixie/memory';
import { readProposal, withdrawStakeInTransaction } from '@heynixie/proposals';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { readProposers } from './read-proposers';
import type { ProposalsToolDeps } from './types';

const inputSchema = z.object({ proposalID: z.string().min(1) });

export function buildProposalsWithdrawTool(deps: ProposalsToolDeps): ToolDefinition {
  return {
    name: 'proposals.withdraw',
    description:
      "Withdraws an open proposal that you proposed, by its ID, so it leaves the owner's list. " +
      'It says the proposal is withdrawn, or that it is closed already. You cannot withdraw ' +
      "another's proposal.",
    input: {
      type: 'object',
      properties: { proposalID: { type: 'string', description: 'the ID proposals.pending shows' } },
      required: ['proposalID'],
      additionalProperties: false,
    },
    output: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['withdrawn', 'closed'] } },
      required: ['status'],
      additionalProperties: false,
    },
    declaration: {
      effects: ['note'],
      destinations: [],
      amount: null,
      content: [],
      results: { status: 'owner_data' },
    },
    execution: 'direct',
    run: (call, context) => {
      const input = inputSchema.parse(call.input);
      const caller = context.run.thread;
      const core = deps.readCore();

      return withWriteTransaction(deps.log.writer, async (tx) => {
        const row = await readProposal(tx, input.proposalID);
        const proposers = await readProposers(tx, caller);

        if (row === null || (row.thread !== caller && !proposers.mergedProposalIDs.has(row.id))) {
          return { status: 'error' as const, message: 'you have no proposal with that ID' };
        }

        const withdrawn = await withdrawStakeInTransaction(core, tx, {
          row,
          caller,
          mergedThreads: await readMergedThreads(tx, row.id),
        });

        if (withdrawn.status === 'not_proposer') {
          return { status: 'error' as const, message: 'you have no proposal with that ID' };
        }

        if (withdrawn.status === 'refused') {
          return { status: 'error' as const, message: 'that proposal cannot be withdrawn' };
        }

        return {
          status: 'ok' as const,
          result: { status: withdrawn.status === 'withdrawn' ? 'withdrawn' : 'closed' },
        };
      });
    },
  };
}
