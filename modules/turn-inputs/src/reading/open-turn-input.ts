import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readRecordKeys, writeRecords } from '@heynixie/log';
import { inputOpenedCodec } from '../state/input-opened-codec';
import type { TurnInputsContext } from '../types';
import { getTurnInputsDB } from '../utils/get-turn-inputs-db';
import { openWithKey } from '../utils/open-with-key';

export type OpenTurnInputResult =
  | { readonly status: 'opened'; readonly inputID: string; readonly body: Uint8Array }
  | { readonly status: 'not_found' }
  | { readonly status: 'removed' }
  | { readonly status: 'not_recorded' };

// Only a stored row opens. The opening is committed to the event log first, and with no commit the
// call reads nothing.
export async function openTurnInput(
  ctx: TurnInputsContext,
  inputID: string,
): Promise<OpenTurnInputResult> {
  const row = await getTurnInputsDB(ctx.log)
    .selectFrom('turn_inputs')
    .select(['key_id', 'state'])
    .where('input_id', '=', inputID)
    .executeTakeFirst();

  if (row === undefined || row.state === 'writing') {
    return { status: 'not_found' };
  }

  if (row.state !== 'stored') {
    return { status: 'removed' };
  }

  try {
    await writeRecords(ctx.log, [
      {
        kind: inputOpenedCodec.kind,
        definitions: ctx.definitions(),
        payload: inputOpenedCodec.encode({ inputID, by: 'host' }),
      },
    ]);
  } catch {
    ctx.logger('turn_input.open_not_recorded', { reason: 'commit_failed' }, 'warn');

    return { status: 'not_recorded' };
  }

  const keys = await readRecordKeys(ctx.log, [row.key_id]);

  const key = keys.get(row.key_id);

  const sealed = await readFile(join(ctx.storeDir, `${inputID}.bin`)).catch(() => null);

  if (key === undefined || key === null || sealed === null) {
    return { status: 'removed' };
  }

  const body = await openWithKey(key, `${row.key_id}#${inputID}`, new Uint8Array(sealed));

  return body === null ? { status: 'removed' } : { status: 'opened', inputID, body };
}
