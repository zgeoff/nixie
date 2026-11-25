import type { JSONObject } from '@heynixie/log';
import type { APIContext, Identity } from '../types';
import {
  writeCheckedComputerAction,
  writeComputerActionResult,
} from './write-checked-computer-action';

export type ComputerActionRun =
  | { readonly status: 'done'; readonly result: Readonly<Record<string, unknown>> }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

export interface ComputerActionInput {
  readonly procedure: string;
  readonly clientActionID: string;

  // what the action acts on besides its action ID, so the ID of one action never answers another
  readonly input: JSONObject;
}

// the last try of each action ID that has not finished, so a second try waits for the first
const tries = new Map<string, Promise<void>>();

// Runs a checked action once for its action ID, and stores what it returned, a refusal too, so a
// retry gets the same answer whatever the desktop is by then. Two tries of one ID that overlap run
// one after the other, and the second reads the first's answer.
export async function runComputerAction(
  context: APIContext,
  caller: Identity,
  action: ComputerActionInput,
  run: () => Promise<JSONObject>,
): Promise<ComputerActionRun> {
  const earlier = tries.get(action.clientActionID) ?? Promise.resolve();
  const turn = Promise.withResolvers<void>();

  tries.set(action.clientActionID, turn.promise);

  try {
    await earlier;

    return await tryAction(context, caller, action, run);
  } finally {
    turn.resolve();

    if (tries.get(action.clientActionID) === turn.promise) {
      tries.delete(action.clientActionID);
    }
  }
}

async function tryAction(
  context: APIContext,
  caller: Identity,
  action: ComputerActionInput,
  run: () => Promise<JSONObject>,
): Promise<ComputerActionRun> {
  const checked = await writeCheckedComputerAction(context, caller, { ...action, result: {} });

  if (checked.status !== 'allowed') {
    return { status: checked.status };
  }

  // a stored action with no result is one that never finished
  if (checked.earlier !== null && Object.keys(checked.earlier).length > 0) {
    return { status: 'done', result: checked.earlier };
  }

  const result = await run();

  await writeComputerActionResult(context, caller, { ...action, result });

  return { status: 'done', result };
}
