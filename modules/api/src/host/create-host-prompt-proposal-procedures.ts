// oxlint-disable new-cap -- oRPC names a procedure's typed errors by their upper-case codes
import type { LogTables } from '@heynixie/log';
import type { PendingPromptProposal, PromptAnswerContext } from '@heynixie/prompts';
import { readPendingPromptProposals } from '@heynixie/prompts';
import type { AnswerSettlement } from '@heynixie/proposals';
import { readProposal } from '@heynixie/proposals';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import type { LegacyAnswer } from '../proposal/answer-legacy-proposal';
import { answerLegacyProposal } from '../proposal/answer-legacy-proposal';
import { hostImplementer } from './host-implementer';

export interface HostPromptContext extends PromptAnswerContext {
  readonly wakeExports: () => void;
}

export function createHostPromptProposalProcedures(context: HostPromptContext) {
  const proposals = hostImplementer.prompts.proposals;

  return {
    list: proposals.list.handler(async () => {
      const pending = await readPendingPromptProposals(context);

      return pending.map((entry) => buildPendingEntry(entry));
    }),

    approve: proposals.approve.handler(async (options) => {
      const input = options.input;

      const settled = await answerPromptProposal(context, {
        proposalID: input.proposalID,
        actionHash: input.proposalHash,
        choice: 'approve',
        ...(input.entry === undefined && input.files === undefined
          ? {}
          : { prompt: { entry: input.entry, files: input.files } }),
      });

      await throwPromptRefusal(context, settled, input, options.errors);

      invariant(settled.status === 'answered', 'a refusal threw');

      const approval = await readPromptApprovalRecord(context, settled.result.proposalID);

      return { proposalID: input.proposalID, ...approval };
    }),

    reject: proposals.reject.handler(async (options) => {
      const settled = await answerPromptProposal(context, {
        proposalID: options.input.proposalID,
        actionHash: options.input.proposalHash,
        choice: 'decline',
        note: options.input.reason,
      });

      await throwPromptRefusal(context, settled, options.input, options.errors);

      return { proposalID: options.input.proposalID };
    }),
  };
}

function buildPendingEntry(entry: PendingPromptProposal) {
  const proposal = entry.proposal;

  return {
    proposalID: proposal.proposalID,
    promptID: proposal.promptID,
    proposalHash: proposal.proposalHash,
    baseHash: proposal.baseHash,
    entry: { ...proposal.entry },
    files: proposal.files.map((file) => ({ path: file.path, text: file.text })),
    reason: proposal.reason,
    inForce:
      entry.inForce === null
        ? null
        : { parts: { ...entry.inForce.parts }, template: entry.inForce.template },
    thread: entry.thread,
    provenance: proposal.provenance,
    createdAt: new Date(entry.proposedAt),
    lapseAt: new Date(entry.lapseAt),
    isStale: entry.isStale,
  };
}

function answerPromptProposal(context: HostPromptContext, answer: LegacyAnswer) {
  return answerLegacyProposal(
    context,
    {
      runInForceSeed: () => Promise.resolve(),
      findPrompts: () => ({
        readInForce: context.readInForce,
        checkProposal: context.checkProposal,
        wakeExports: context.wakeExports,
      }),
    },
    'prompt',
    answer,
  );
}

interface PromptErrorOptions {
  readonly message: string;
}

type PromptErrors = Readonly<
  Record<
    'NOT_FOUND' | 'PROPOSAL_HASH' | 'PROPOSAL_CLOSED' | 'STALE_BASE' | 'PROMPT_CHECK',
    (options: PromptErrorOptions) => Error
  >
>;

interface PromptAnswerInput {
  readonly proposalID: string;
  readonly proposalHash: string;
}

async function throwPromptRefusal(
  context: HostPromptContext,
  settled: AnswerSettlement,
  input: PromptAnswerInput,
  errors: PromptErrors,
): Promise<void> {
  if (settled.status === 'answered') {
    return;
  }

  const refusal = settled.refusal;
  const message = `the prompt proposal ${input.proposalID} cannot take this answer`;

  if (refusal.error === 'NOT_FOUND') {
    throw errors.NOT_FOUND({ message });
  }

  if (refusal.error === 'CLOSED') {
    throw errors.PROPOSAL_CLOSED({ message });
  }

  if (refusal.error === 'CONFLICT') {
    // The hash the answer names is the proposal's own when the override in force moved past its base.
    const row = await readProposal(context.log.writer.db, input.proposalID);

    throw errors[row?.actionHash === input.proposalHash ? 'STALE_BASE' : 'PROPOSAL_HASH']({
      message,
    });
  }

  throw errors.PROMPT_CHECK({ message });
}

const approvedSchema = z.object({ approvalID: z.string(), proposalHash: z.string() });

async function readPromptApprovalRecord(context: HostPromptContext, proposalID: string) {
  const row = await context.log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('payload')
    .where('kind', '=', 'prompts.override_approved')
    .where(sql`json_extract(payload, '$.proposalID')`, '=', proposalID)
    .executeTakeFirstOrThrow();

  return approvedSchema.parse(JSON.parse(row.payload));
}
