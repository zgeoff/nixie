import type { ContractInputs } from '@heynixie/contract';
import type {
  AnswerOutcome,
  AnswerSettlement,
  PasskeyGate,
  PasskeyRefusal,
  ProposalCoreDeps,
} from '@heynixie/proposals';
import { answerProposal } from '@heynixie/proposals';
import { z } from 'zod';
import type { APIContext, Identity } from '../types';
import { buildInputHash } from '../utils/build-input-hash';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import { readClientAction } from '../utils/read-client-action';
import { writeClientAction } from '../utils/write-client-action';
import { SettledError } from './settled-error';
import { storedApprovalSchema } from './stored-approval-schema';

export type ApprovalAnswer = ContractInputs['approvals']['answerProposal'];

export type ApprovalRun =
  | { readonly status: 'settled'; readonly settlement: AnswerSettlement }
  | { readonly status: 'unauthorized' }
  | { readonly status: 'passkey_refused'; readonly refusal: PasskeyRefusal }
  | { readonly status: 'reused' };

const procedure = 'approvals.answerProposal';

export interface ApprovalAnswerRequest {
  readonly answer: ApprovalAnswer;
  readonly passkey: PasskeyGate | undefined;
}

// A checked action: the refusal of an answer is stored under the client action ID, so a retry gets
// the same refusal. A passkey refusal is the exception: nothing is stored, so a retry with a fresh
// assertion runs every check again.
export async function runApprovalAnswer(
  context: APIContext,
  deps: ProposalCoreDeps,
  caller: Identity,
  request: ApprovalAnswerRequest,
): Promise<ApprovalRun> {
  const answer = request.answer;
  const inputHash = buildInputHash(buildHashedInput(answer));
  const query = { context, caller, answer, inputHash };

  const earlier = await readSettled(context.log.writer.db, query);

  if (earlier !== null) {
    return earlier;
  }

  try {
    const outcome = await answerProposal(deps, buildAnswerInput(answer, caller), {
      ...(request.passkey === undefined ? {} : { passkey: request.passkey }),
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
  if (outcome.status === 'unauthorized' || outcome.status === 'passkey_refused') {
    return outcome;
  }

  return { status: 'settled', settlement: outcome };
}
