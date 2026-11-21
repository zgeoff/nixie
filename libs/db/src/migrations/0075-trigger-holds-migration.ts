import { sql } from 'kysely';
import type { Migration } from '../types';

// trigger_definitions is a projection, so a rebuild of the log fills both columns again. A hold is
// one slot that a snooze keeps back until a time, and a definition with none holds null in both.
export const triggerHoldsMigration: Migration = {
  name: 'add the hold of a snoozed slot to the trigger definitions',
  up: async (tx) => {
    await sql`alter table trigger_definitions add column hold_slot integer`.execute(tx);
    await sql`alter table trigger_definitions add column hold_until integer`.execute(tx);
  },
};
