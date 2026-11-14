import { writeRecords } from '@heynixie/log';
import { closeCaptures } from '../capture/close-captures';
import { removeAllInputs } from '../removal/remove-all-inputs';
import type { TurnInputsContext } from '../types';
import { inputLogSetCodec } from './input-log-set-codec';

export type SetInputLogRequest =
  | { readonly state: 'on'; readonly forMs: number | null }
  | { readonly state: 'off'; readonly drop: boolean };

export type SetInputLogResult =
  | { readonly status: 'set'; readonly state: 'on' | 'off'; readonly until: number | null }
  | { readonly status: 'not_configured' };

// `off` closes every open capture, and with `drop` removes every logged request. Either throws when
// a key could not be removed, and a rerun finishes the work.
export async function setInputLog(
  ctx: TurnInputsContext,
  request: SetInputLogRequest,
): Promise<SetInputLogResult> {
  if (ctx.config === null) {
    return { status: 'not_configured' };
  }

  const until =
    request.state === 'on' && request.forMs !== null
      ? ctx.clock.now() + Math.min(request.forMs, ctx.config.maxWindowMs)
      : null;

  await writeRecords(ctx.log, [
    {
      kind: inputLogSetCodec.kind,
      definitions: ctx.definitions(),
      payload: inputLogSetCodec.encode({ state: request.state, until }),
    },
  ]);

  if (request.state === 'off') {
    await closeCaptures(ctx, { cause: 'off' });

    if (request.drop) {
      await removeAllInputs(ctx);
    }
  }

  return { status: 'set', state: request.state, until };
}
