import { parseJSONObject } from '@heynixie/log';
import type { TurnInputsContext } from '../types';
import { getTurnInputsDB } from '../utils/get-turn-inputs-db';
import { inputLogSetCodec } from './input-log-set-codec';
import type { InputLogSetting } from './pick-input-log-state';
import { pickInputLogState } from './pick-input-log-state';

export async function readInputLogState(
  ctx: Pick<TurnInputsContext, 'log' | 'clock' | 'config'>,
): Promise<InputLogSetting> {
  const row = await getTurnInputsDB(ctx.log)
    .selectFrom('records')
    .select('payload')
    .where('kind', '=', inputLogSetCodec.kind)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  const latest = row === undefined ? null : inputLogSetCodec.decode(parseJSONObject(row.payload));

  return pickInputLogState(ctx.config, latest, ctx.clock.now());
}
