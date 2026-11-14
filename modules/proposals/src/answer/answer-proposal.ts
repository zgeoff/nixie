import { withWriteTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { checkAnswer } from './check-answer';
import type { ApplyOutcome, ApplyRun, ProposalAnswerInput } from './proposal-kind-handler';
import { RefusedError } from './refused-error';
import type {
  AnswerHooks,
  AnswerOutcome,
  AnswerSettlement,
  Checked,
  ProposalCoreDeps,
} from './types';
import { writeDefer } from './write-defer';

// The checks run in order inside one write transaction, and the first that fails refuses the
// answer.
export async function answerProposal(
  deps: ProposalCoreDeps,
  answer: ProposalAnswerInput,
  hooks: AnswerHooks = {},
): Promise<AnswerOutcome> {
  const decision = await withWriteTransaction(deps.log.writer, (tx) =>
    decideAnswer(deps, tx, { answer, hooks }),
  );

  if (decision.status === 'unauthorized') {
    return decision;
  }

  if (decision.status === 'owned') {
    return runOwnedApply(deps, decision.ready, { answer, hooks });
  }

  await decision.afterCommit?.();

  return decision.status === 'answered'
    ? { status: 'answered', result: decision.result }
    : { status: 'refused', refusal: decision.refusal };
}

type Ready = Extract<Checked, { readonly status: 'checked' }>;

type Decision =
  | { readonly status: 'unauthorized' }
  | { readonly status: 'owned'; readonly ready: Ready }
  | (AnswerSettlement & { readonly afterCommit?: () => Promise<void> });

interface AnswerRequest {
  readonly answer: ProposalAnswerInput;
  readonly hooks: AnswerHooks;
}

async function decideAnswer(
  deps: ProposalCoreDeps,
  tx: Transaction<unknown>,
  request: AnswerRequest,
): Promise<Decision> {
  const answer = request.answer;
  const hooks = request.hooks;

  const probed = await hooks.probeCaller?.(tx);

  const isCallerLive = probed ?? true;

  if (!isCallerLive) {
    return { status: 'unauthorized' };
  }

  const checked = await checkAnswer(deps, tx, answer, hooks.family);

  if (checked.status === 'refused') {
    return settle(tx, hooks, { status: 'refused', refusal: checked.refusal });
  }

  if (answer.choice === 'defer') {
    const deferred = await writeDefer(deps, tx, {
      row: checked.row,
      handler: checked.handler,
      answer,
    });

    return settle(tx, hooks, deferred);
  }

  if (checked.handler.ownsTransaction) {
    return { status: 'owned', ready: checked };
  }

  const applied = await applyChoice(checked, answer, { tx, guard: () => Promise.resolve() });

  return settleApplied(tx, hooks, applied);
}

async function settle(
  tx: Transaction<unknown>,
  hooks: AnswerHooks,
  settlement: AnswerSettlement,
): Promise<AnswerSettlement> {
  await hooks.writeSettlement?.(tx, settlement);

  return settlement;
}

function applyChoice(
  ready: Ready,
  answer: ProposalAnswerInput,
  run: ApplyRun,
): Promise<ApplyOutcome> {
  return answer.choice === 'decline'
    ? ready.handler.decline(run, ready.row, answer)
    : ready.handler.approve(run, ready.row, answer);
}

async function settleApplied(
  tx: Transaction<unknown>,
  hooks: AnswerHooks,
  applied: ApplyOutcome,
): Promise<Decision> {
  if (applied.status === 'refused') {
    return settle(tx, hooks, { status: 'refused', refusal: applied.refusal });
  }

  const settled = await settle(tx, hooks, { status: 'answered', result: applied.result });

  return applied.afterCommit === undefined
    ? settled
    : { ...settled, afterCommit: applied.afterCommit };
}

// A kind that owns its transaction applies the choice in its own. The guard runs there, so the
// checks hold at the commit.
async function runOwnedApply(
  deps: ProposalCoreDeps,
  ready: Ready,
  request: AnswerRequest,
): Promise<AnswerOutcome> {
  const answer = request.answer;
  const hooks = request.hooks;

  const predicted: AnswerSettlement = {
    status: 'answered',
    result: {
      proposalID: ready.row.id,
      state: answer.choice === 'decline' ? 'declined' : 'approved',
    },
  };

  const guard = async (tx: Transaction<unknown>): Promise<void> => {
    const again = await checkAnswer(deps, tx, answer, hooks.family);

    if (again.status === 'refused') {
      throw new RefusedError(again.refusal);
    }

    await hooks.writeSettlement?.(tx, predicted);
  };

  const applied = await applyOwned(ready, answer, guard);

  if (applied.status === 'refused') {
    const refused: AnswerSettlement = { status: 'refused', refusal: applied.refusal };

    return withWriteTransaction(deps.log.writer, (tx) => settle(tx, hooks, refused));
  }

  await applied.afterCommit?.();

  return { status: 'answered', result: applied.result };
}

async function applyOwned(
  ready: Ready,
  answer: ProposalAnswerInput,
  guard: ApplyRun['guard'],
): Promise<ApplyOutcome> {
  try {
    return await applyChoice(ready, answer, { tx: null, guard });
  } catch (error) {
    if (error instanceof RefusedError) {
      return { status: 'refused', refusal: error.refusal };
    }

    throw error;
  }
}
