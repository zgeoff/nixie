import type { ContractInputs } from '@heynixie/contract';
import type { AnswerOutcome, AnswerSettlement, ProposalCoreDeps } from '@heynixie/proposals';
import { answerProposal } from '@heynixie/proposals';
import { z } from 'zod';
import { buildInputHash } from './build-input-hash';
import { probeLiveIdentity } from './probe-live-identity';
import { readClientAction } from './read-client-action';
import { SettledError } from './settled-error';
import { storedApprovalSchema } from './stored-approval-schema';
import type { APIContext, Identity } from './types';
import { writeClientAction } from './write-client-action';

export type ApprovalAnswer = ContractInputs['approvals']['answerProposal'];

export type ApprovalRun =
  | { readonly status: 'settled'; readonly settlement: AnswerSettlement }
  | { readonly status: 'unauthorized' }
  | { readonly status: 'reused' };

const procedure = 'approvals.answerProposal';

// A checked action: the refusal of an answer is stored under the client action ID in the answer's
// own transaction, so a retry gets the same refusal.
export async function runApprovalAnswer(
  context: APIContext,
  deps: ProposalCoreDeps,
  caller: Identity,
  answer: ApprovalAnswer,
): Promise<ApprovalRun> {
  const inputHash = buildInputHash(buildHashedInput(answer));
  const query = { context, caller, answer, inputHash };

  const earlier = await readSettled(context.log.writer.db, query);

  if (earlier !== null) {
    return earlier;
  }

  try {
    const outcome = await answerProposal(deps, buildAnswerInput(answer, caller), {
      probeCaller: (tx) => probeLiveIdentity(tx, context, caller.identityID),
      writeSettlement: async (tx, settlement) => {
        const settled = await readSettled(tx, query);

        if (settled !== null) {
          throw new SettledError(settled);
        }

        await writeClientAction(tx, {
          clientActionID: answer.clientActionID,
          procedure,
          identityID: caller.identityID,
          inputHash,
          result: z.record(z.string(), z.json()).parse(settlement),
          recordedAt: context.clock.now(),
        });
      },
    });

    return toRun(outcome);
  } catch (error) {
    // an overlapping call with the same ID may have committed first
    if (error instanceof SettledError) {
      return error.settlement;
    }

    const committed = await readSettled(context.log.writer.db, query);

    if (committed === null) {
      throw error;
    }

    return committed;
  }
}

// A hash of free text alone confirms a guess at the text, so the note and an edit count as flags.
function buildHashedInput(answer: ApprovalAnswer) {
  return {
    proposalID: answer.proposalID,
    actionHash: answer.actionHash,
    choice: answer.choice,
    ruleHash: answer.ruleHash ?? null,
    deferUntil: answer.deferUntil?.toISOString() ?? null,
    hasNote: answer.note !== undefined,
    isEdited: answer.memory?.editedText !== undefined,
    revisionOf: answer.memory?.revisionOf?.itemID ?? null,
    ignoreCloseMatch: answer.memory?.ignoreCloseMatch ?? null,
  };
}

interface AnswerQuery {
  readonly context: APIContext;
  readonly caller: Identity;
  readonly answer: ApprovalAnswer;
  readonly inputHash: string;
}

async function readSettled(
  db: Parameters<typeof readClientAction>[0],
  query: AnswerQuery,
): Promise<ApprovalRun | null> {
  const earlier = await readClientAction(db, query.answer.clientActionID);

  if (earlier === null) {
    return null;
  }

  const isSame =
    earlier.procedure === procedure &&
    earlier.identityID === query.caller.identityID &&
    earlier.inputHash === query.inputHash;

  return isSame
    ? { status: 'settled', settlement: storedApprovalSchema.parse(earlier.result) }
    : { status: 'reused' };
}

function buildAnswerInput(answer: ApprovalAnswer, caller: Identity) {
  return {
    proposalID: answer.proposalID,
    actionHash: answer.actionHash,
    choice: answer.choice,
    ...(answer.ruleHash === undefined ? {} : { ruleHash: answer.ruleHash }),
    ...(answer.deferUntil === undefined ? {} : { deferUntil: answer.deferUntil.getTime() }),
    ...(answer.note === undefined ? {} : { note: answer.note }),
    ...(answer.memory === undefined ? {} : { memory: answer.memory }),
    identityID: caller.identityID,
  };
}

function toRun(outcome: AnswerOutcome): ApprovalRun {
  return outcome.status === 'unauthorized'
    ? { status: 'unauthorized' }
    : { status: 'settled', settlement: outcome };
}
