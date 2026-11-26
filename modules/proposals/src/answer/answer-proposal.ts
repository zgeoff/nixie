import { withWriteTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { buildApplyRun } from '../propose/build-apply-run';
import { checkAnswer } from './check-answer';
import { checkPasskey } from './check-passkey';
import { PasskeyRefusedError } from './passkey-refused-error';
import type {
  AnswerResult,
  ApplyOutcome,
  ApplyRun,
  ClosedResult,
  ProposalAnswerInput,
} from './proposal-kind-handler';
import { RefusedError } from './refused-error';
import type {
  AnswerHooks,
  AnswerOutcome,
  AnswerSettlement,
  Checked,
  PasskeyRefusal,
  ProposalCoreDeps,
} from './types';
import { UnauthorizedError } from './unauthorized-error';
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

  if (decision.status === 'unauthorized' || decision.status === 'passkey_refused') {
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
  | { readonly status: 'passkey_refused'; readonly refusal: PasskeyRefusal }
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

  if (!checked.handler.ownsTransaction) {
    const refusal = await checkPasskey(tx, hooks.passkey, { row: checked.row, answer });

    if (refusal !== null) {
      return { status: 'passkey_refused', refusal };
    }
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

  const run = buildApplyRun(
    deps,
    { row: checked.row, outcome: pickOutcome(answer), answer, byProposer: false },
    { tx, guard: () => Promise.resolve() },
  );

  const applied = await applyChoice(checked, answer, run);

  if (applied.status === 'done') {
    await run.settle(tx, applied);
  }

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

function pickOutcome(answer: ProposalAnswerInput): 'approved' | 'declined' {
  return answer.choice === 'decline' ? 'declined' : 'approved';
}

function applyChoice(
  ready: Ready,
  answer: ProposalAnswerInput,
  run: ApplyRun,
): Promise<ApplyOutcome> {
  return answer.choice === 'decline'
    ? ready.handler.discard(run, ready.row, 'declined', answer)
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

  const result = toAnswerResult(applied.result);

  const settled = await settle(tx, hooks, { status: 'answered', result });

  return applied.afterCommit === undefined
    ? settled
    : { ...settled, afterCommit: applied.afterCommit };
}

function toAnswerResult(result: AnswerResult | ClosedResult): AnswerResult {
  invariant(isAnswerResult(result), 'an answer never lapses or withdraws a proposal');

  return result;
}

function isAnswerResult(result: AnswerResult | ClosedResult): result is AnswerResult {
  return result.state !== 'lapsed' && result.state !== 'withdrawn';
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
    const probed = await hooks.probeCaller?.(tx);

    if (probed === false) {
      throw new UnauthorizedError();
    }

    const again = await checkAnswer(deps, tx, answer, hooks.family);

    if (again.status === 'refused') {
      throw new RefusedError(again.refusal);
    }

    const refusal = await checkPasskey(tx, hooks.passkey, { row: again.row, answer });

    if (refusal !== null) {
      throw new PasskeyRefusedError(refusal);
    }

    await hooks.writeSettlement?.(tx, predicted);
  };

  const run = buildApplyRun(
    deps,
    { row: ready.row, outcome: pickOutcome(answer), answer, byProposer: false },
    { tx: null, guard },
  );

  const applied = await applyOwned(ready, answer, run);

  if (applied.status === 'unauthorized' || applied.status === 'passkey_refused') {
    return applied;
  }

  if (applied.status === 'refused') {
    const refused: AnswerSettlement = { status: 'refused', refusal: applied.refusal };

    return withWriteTransaction(deps.log.writer, (tx) => settle(tx, hooks, refused));
  }

  const result = toAnswerResult(applied.result);

  await applied.afterCommit?.();

  return { status: 'answered', result };
}

async function applyOwned(
  ready: Ready,
  answer: ProposalAnswerInput,
  run: ApplyRun,
): Promise<
  | ApplyOutcome
  | { readonly status: 'unauthorized' }
  | { readonly status: 'passkey_refused'; readonly refusal: PasskeyRefusal }
> {
  try {
    return await applyChoice(ready, answer, run);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return { status: 'unauthorized' };
    }

    if (error instanceof PasskeyRefusedError) {
      return { status: 'passkey_refused', refusal: error.refusal };
    }

    if (error instanceof RefusedError) {
      return { status: 'refused', refusal: error.refusal };
    }

    throw error;
  }
}
