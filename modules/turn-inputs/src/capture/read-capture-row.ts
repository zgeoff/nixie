import type { Selectable } from 'kysely';
import type { TurnInputsContext } from '../types';
import { getTurnInputsDB } from '../utils/get-turn-inputs-db';
import type { TurnInputsTables } from '../utils/turn-inputs-tables';

export type CaptureRow = Selectable<TurnInputsTables['turn_input_captures']>;

export async function readCaptureRow(
  ctx: Pick<TurnInputsContext, 'log'>,
  captureID: string,
): Promise<CaptureRow | null> {
  const row = await getTurnInputsDB(ctx.log)
    .selectFrom('turn_input_captures')
    .selectAll()
    .where('capture_id', '=', captureID)
    .executeTakeFirst();

  return row ?? null;
}
