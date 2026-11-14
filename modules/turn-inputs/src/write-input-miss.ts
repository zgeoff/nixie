import { withWriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import type { TurnInputsContext } from './types';
import type { InputMissReason, TurnInputsTables } from './utils/turn-inputs-tables';

export interface InputMiss {
  readonly captureID: string | null;
  readonly taskID: string;
  readonly stepRunID: string;
  readonly reason: InputMissReason;
  readonly count?: number;
  readonly writer?: string;
  readonly counter?: number;
}

export async function writeInputMiss(ctx: TurnInputsContext, miss: InputMiss): Promise<void> {
  const count = miss.count ?? 1;

  await withWriteTransaction(ctx.log.writer, async (tx) => {
    const db = tx.$extendTables<TurnInputsTables>();

    await db
      .insertInto('turn_input_misses')
      .values({
        miss_id: crypto.randomUUID(),
        capture_id: miss.captureID,
        task_id: miss.taskID,
        step_run_id: miss.stepRunID,
        reason: miss.reason,
        count,
        writer: miss.writer ?? null,
        counter: miss.counter ?? null,
        created_at: ctx.clock.now(),
      })
      .execute();

    if (miss.captureID !== null) {
      await db
        .updateTable('turn_input_captures')
        .set({ misses: sql`misses + ${count}` })
        .where('capture_id', '=', miss.captureID)
        .execute();
    }
  });
}
