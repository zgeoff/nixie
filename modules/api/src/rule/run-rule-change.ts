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
  | { readonly status: 'done' }
  | { readonly status: 'unauthorized' }
  | { readonly status: 'reused' }
  | {
      readonly status: 'refused';
      readonly outcome: Exclude<RuleEditOutcome, { status: 'written' | 'unchanged' }>;
    };

// A checked action: a retry of a change that committed settles as done, and an ID under another
// change or caller is reused. The in-force seed runs after the change commits.
export async function runRuleChange(
  context: APIContext & { readonly runInForceSeed: () => Promise<unknown> },
  caller: Identity,
  change: RuleChange,
): Promise<RuleChangeRun> {
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

      return isSame ? { status: 'done' } : { status: 'reused' };
    }

    const outcome = await writeRuleEdit(tx, context, {
      ruleID: change.ruleID,
      request: change.request,
    });

    if (outcome.status === 'refused') {
      return { status: 'refused', outcome };
    }

    await writeClientAction(tx, {
      clientActionID: change.clientActionID,
      procedure: change.procedure,
      identityID: caller.identityID,
      inputHash,
      result: { ruleID: change.ruleID },
      recordedAt: context.clock.now(),
    });

    return { status: 'done' };
  });

  if (run.status === 'done') {
    await context.runInForceSeed();
  }

  return run;
}
