import { waitForSettled } from '@heynixie/async';
import type { RuleEditOutcome, RuleEditRequest } from '@heynixie/definitions';
import { writeRuleEdit } from '@heynixie/definitions';
import { withWriteTransaction } from '@heynixie/log';
import type { APIContext, Identity } from '../types';
import { buildInputHash } from '../utils/build-input-hash';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import { readClientAction } from '../utils/read-client-action';
import { writeClientAction } from '../utils/write-client-action';

export interface RuleChange {
  readonly clientActionID: string;
  readonly procedure: string;
  readonly ruleID: string;
  readonly request: RuleEditRequest;
}

export type RuleChangeRun =
  | { readonly status: 'done'; readonly revision: number | null }
  | { readonly status: 'unauthorized' }
  | { readonly status: 'reused' }
  | {
      readonly status: 'refused';
      readonly outcome: Exclude<RuleEditOutcome, { status: 'written' | 'unchanged' }>;
    };

type RuleChangeContext = APIContext & { readonly runInForceSeed: () => Promise<unknown> };

const pendingChanges = new WeakMap<object, Promise<void>>();

// The in-force seed moves a rule's revision after its change commits, so changes run one at a time,
// each through its seed, and a later change checks the revision the earlier one left.
export function runRuleChange(
  context: RuleChangeContext,
  caller: Identity,
  change: RuleChange,
): Promise<RuleChangeRun> {
  const queued = waitThenRunChange(pendingChanges.get(context.log.writer), context, caller, change);

  pendingChanges.set(context.log.writer, waitForSettled(queued));

  return queued;
}

async function waitThenRunChange(
  previous: Promise<void> | undefined,
  context: RuleChangeContext,
  caller: Identity,
  change: RuleChange,
): Promise<RuleChangeRun> {
  await previous;

  const inputHash = buildInputHash({
    ruleID: change.ruleID,
    ...(change.request.action === 'edit' ? { destinations: [...change.request.destinations] } : {}),
    revision: change.request.revision,
  });

  const run = await withWriteTransaction(context.log.writer, async (tx): Promise<RuleChangeRun> => {
    if (!(await probeLiveIdentity(tx, context, caller.identityID))) {
      return { status: 'unauthorized' };
    }

    const earlier = await readClientAction(tx, change.clientActionID);

    if (earlier !== null) {
      const isSame =
        earlier.procedure === change.procedure &&
        earlier.identityID === caller.identityID &&
        earlier.inputHash === inputHash;

      return isSame
        ? { status: 'done', revision: readStoredRevision(earlier.result) }
        : { status: 'reused' };
    }

    const outcome = await writeRuleEdit(tx, context, {
      ruleID: change.ruleID,
      request: change.request,
    });

    if (outcome.status === 'refused') {
      return { status: 'refused', outcome };
    }

    const revision = pickEditedRevision(change.request, outcome);

    await writeClientAction(tx, {
      clientActionID: change.clientActionID,
      procedure: change.procedure,
      identityID: caller.identityID,
      inputHash,
      result: revision === null ? { ruleID: change.ruleID } : { ruleID: change.ruleID, revision },
      recordedAt: context.clock.now(),
    });

    return { status: 'done', revision };
  });

  if (run.status === 'done') {
    await context.runInForceSeed();
  }

  return run;
}

function readStoredRevision(result: Readonly<Record<string, unknown>>): number | null {
  const revision = result['revision'];

  return typeof revision === 'number' ? revision : null;
}

// The seed moves a rule to the next revision when an edit changed it, and leaves it when the edit
// changed nothing. A removal leaves no revision.
function pickEditedRevision(
  request: RuleEditRequest,
  outcome: Extract<RuleEditOutcome, { status: 'written' | 'unchanged' }>,
): number | null {
  if (request.action === 'remove') {
    return null;
  }

  return outcome.status === 'written' ? request.revision + 1 : request.revision;
}
