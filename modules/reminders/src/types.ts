import type { CheckedTables } from '@heynixie/db';
import type { Definitions, Log } from '@heynixie/log';
import type { RelatedMemoryLookup } from '@heynixie/tools';
import type { ReadZone } from '@heynixie/triggers';

export type ReminderState = 'active' | 'fired' | 'cancelled';

export type ReminderOrigin = 'conversation' | 'migration';

interface ReminderTable {
  readonly reminder_id: string;
  readonly short_id: string;
  readonly reminder_hash: string;

  // canonical JSON
  readonly trigger: string;
  readonly state: ReminderState;
  readonly origin: ReminderOrigin;
  readonly set_sequence: number;

  // epoch milliseconds; null until a one-off fires
  readonly fired_at: number | null;

  // a JSON array of the newest 3 fire instants, ISO, oldest first
  readonly recent_fires: string;
  readonly updated_sequence: number;
}

interface ReminderVersionTable {
  readonly reminder_hash: string;
  readonly name: string;
  readonly note: string;

  // canonical JSON
  readonly trigger: string;
}

interface ReminderMoveTable {
  readonly definition_id: string;
  readonly name: string;
  readonly note: string;
  readonly trigger: string;
  readonly source: 'repo' | 'runtime';
  readonly change_id: string | null;
}

export type RemindersTables = CheckedTables<
  Readonly<{
    reminders: ReminderTable;
    reminder_versions: ReminderVersionTable;
    reminder_moves: ReminderMoveTable;
  }>
>;

export interface RemindersContext {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly readZone: ReadZone;

  // the shortest gap between 2 fires of a recurring reminder, from reminders.min_gap_minutes
  readonly minGapMinutes: number;

  // what reminder.set looks up in memory after it applies; without it, the result carries no
  // `related`
  readonly relatedMemory?: RelatedMemoryLookup;
}
