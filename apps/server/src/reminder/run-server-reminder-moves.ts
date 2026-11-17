import { writeReminderMoveSettle } from '@heynixie/definitions';
import { runReminderMoves } from '@heynixie/reminders';
import type { ServerParts } from '../types';

// Turns the definitions that the reminders migration staged into reminders. It runs after the seed and
// before the trigger sources, so no source fires an old trigger and a new one for one slot.
export async function runServerReminderMoves(
  parts: Pick<ServerParts, 'context' | 'log'>,
): Promise<void> {
  const context = parts.context;

  const moved = await runReminderMoves(
    {
      log: context.log,
      definitions: context.definitions,
    },
    async (tx, move) => {
      if (move.changeID !== null) {
        await writeReminderMoveSettle(tx, context, {
          changeID: move.changeID,
          definitionID: move.definitionID,
        });
      }
    },
  );

  if (moved > 0) {
    parts.log('reminders.moved', { reminders: moved });
  }
}
