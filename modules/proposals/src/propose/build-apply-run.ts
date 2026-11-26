import type { Transaction } from 'kysely';
import type {
  ApplyRun,
  DoneOutcome,
  ProposalAnswerInput,
  SharedProposal,
} from '../answer/proposal-kind-handler';
import type { ProposeDeps } from '../answer/types';
import type { ProposalOutcome } from '../types';
import { writeSettlement } from './write-settlement';

export interface ApplyRunFacts {
  readonly row: SharedProposal;
  readonly outcome: ProposalOutcome;
  readonly answer: ProposalAnswerInput | null;
  readonly byProposer: boolean;
}

export interface ApplyRunBase {
  readonly tx: Transaction<unknown> | null;
  readonly guard: ApplyRun['guard'];
}

// The settle of a run writes proposals.settled for a done outcome that closed the row. A result of
// a row that stays open, such as a memory close match, writes none.
export function buildApplyRun(
  deps: ProposeDeps,
  facts: ApplyRunFacts,
  base: ApplyRunBase,
): ApplyRun {
  return {
    ...base,
    settle: async (tx, outcome) => {
      if (!isClosing(outcome)) {
        return;
      }

      await writeSettlement(deps, tx, {
        row: facts.row,
        outcome: facts.outcome,
        answeredBy: facts.answer?.identityID ?? null,
        usedBy: outcome.usedBy,
        reason: facts.answer?.note ?? null,
        detail: outcome.detail,
        otherThreads: outcome.otherThreads,
        byProposer: facts.byProposer,
      });
    },
  };
}

function isClosing(outcome: DoneOutcome): boolean {
  return outcome.result.state !== 'pending' && outcome.result.state !== 'deferred';
}
