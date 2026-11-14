import {
  pauseNixieInTransaction,
  readPauseSince,
  resumeNixieInTransaction,
  withWriteTransaction,
} from '@heynixie/log';
import { z } from 'zod';
import type { APIContext, Identity } from '../types';
import { buildInputHash } from '../utils/build-input-hash';
import { probeLiveIdentity } from '../utils/probe-live-identity';
import type { ClientAction } from '../utils/read-client-action';
import { readClientAction } from '../utils/read-client-action';
import { writeClientAction } from '../utils/write-client-action';
import type { PauseState } from './to-pause-state';
import { toPauseState } from './to-pause-state';

export type NixieControl = 'pause' | 'resume';

export type CheckedNixieControlResult =
  | { readonly status: 'controlled'; readonly paused: PauseState | null }
  | { readonly status: 'reused' }
  | { readonly status: 'unauthorized' };

interface CheckedNixieControlInput {
  readonly clientActionID: string;
  readonly control: NixieControl;
}

export function writeCheckedNixieControl(
  context: APIContext,
  caller: Identity,
  input: CheckedNixieControlInput,
): Promise<CheckedNixieControlResult> {
  const procedure = `nixie.${input.control}`;
  const inputHash = buildInputHash({});

  return withWriteTransaction(context.log.writer, async (tx) => {
    const [live, earlier] = await Promise.all([
      probeLiveIdentity(tx, context, caller.identityID),
      readClientAction(tx, input.clientActionID),
    ]);

    const settled = pickSettledControl({
      live,
      earlier,
      procedure,
      inputHash,
      callerID: caller.identityID,
    });

    if (settled !== null) {
      return settled;
    }

    if (input.control === 'pause') {
      await pauseNixieInTransaction(tx, context.log, {
        cause: 'owner',
        recoveryID: null,
        by: caller.identityID,
        definitions: context.definitions(),
      });
    } else {
      await resumeNixieInTransaction(tx, context.log, {
        by: caller.identityID,
        definitions: context.definitions(),
      });
    }

    const pause = await readPauseSince(tx);

    const paused = toPauseState(pause);

    await writeClientAction(tx, {
      clientActionID: input.clientActionID,
      procedure,
      identityID: caller.identityID,
      inputHash,
      result: { paused: paused === null ? null : { cause: paused.cause, since: paused.since } },
      recordedAt: context.clock.now(),
    });

    return { status: 'controlled', paused };
  });
}

interface ControlState {
  readonly live: boolean;
  readonly earlier: ClientAction | null;
  readonly procedure: string;
  readonly inputHash: string;
  readonly callerID: string;
}

const storedResultSchema = z.object({
  paused: z
    .object({ cause: z.enum(['restore', 'owner', 'spending']), since: z.number() })
    .nullable(),
});

function pickSettledControl(state: ControlState): CheckedNixieControlResult | null {
  if (!state.live) {
    return { status: 'unauthorized' };
  }

  if (state.earlier === null) {
    return null;
  }

  const isSameAction =
    state.earlier.procedure === state.procedure &&
    state.earlier.identityID === state.callerID &&
    state.earlier.inputHash === state.inputHash;

  return isSameAction
    ? { status: 'controlled', ...storedResultSchema.parse(state.earlier.result) }
    : { status: 'reused' };
}
