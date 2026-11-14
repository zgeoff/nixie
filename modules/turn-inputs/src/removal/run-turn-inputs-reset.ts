import { rm } from 'node:fs/promises';
import type { TurnInputsContext } from '../types';

// The full reset has already emptied the tables and the key store. This drops the open captures
// and deletes the folder of sealed bodies.
export function runTurnInputsReset(ctx: TurnInputsContext): Promise<void> {
  return ctx.lane.run(async () => {
    ctx.open.clear();
    ctx.failures.clear();

    await rm(ctx.storeDir, { recursive: true, force: true });
  });
}
