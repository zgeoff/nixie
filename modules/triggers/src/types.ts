import type { Clock } from '@heynixie/clock';
import type { Schedule, Trigger } from '@heynixie/contract';
import type { CheckedTables } from '@heynixie/db';
import type { Definitions, JSONObject, JSONValue, Log } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { readDefinitionTaskInTransaction } from '@heynixie/tasks';
import type { Transaction } from 'kysely';

// A definition in force that has a trigger, as the seed hands it to the arming hook.
export interface ArmedDefinition {
  readonly definitionID: string;
  readonly definitionHash: string;

  // the source of `schedule` and `at`
  readonly source: 'schedule';
  readonly target: 'task' | 'conversation';
  readonly trigger: Trigger;

  // a watermark to carry over from a trigger this one replaces, epoch milliseconds
  readonly after?: number;
}

export interface ScheduleTriggerEvent {
  readonly definitionID: string;

  // the version the source computed the event from
  readonly definitionHash: string;
  readonly kind: 'schedule' | 'at';
  readonly dedupeKey: string;

  // ISO instant: the newest slot the event covers
  readonly scheduledFor: string;

  // ISO instant the source built the event
  readonly occurredAt: string;

  // earlier slots never delivered, ISO, oldest first: the 20 newest
  readonly missed: readonly string[];

  // the full number of earlier missed slots
  readonly missedCount: number;

  // set when the source decides a skip
  readonly skip?: 'too_late' | 'catch_up_off' | 'window_closed';

  // a poll source sets outside content here
  readonly payload: null;
}

// An event of a source that names its task, such as a coding session's event. The core writes it as
// a `trigger.task_input` record on the task's thread, and reads no definition for it.
export interface TaskInputEvent {
  readonly kind: 'task_input';
  readonly taskID: string;

  // unique within the source; the core drops an event whose key it holds
  readonly dedupeKey: string;

  // ISO instant
  readonly occurredAt: string;

  // the hop of the exchange the event belongs to
  readonly hop: number;

  // true: the record wakes the task
  readonly wake: boolean;

  // the facts of the event that are no text of a person's, such as its kind and a state, which the
  // source's own projection reads; the record keeps them in its payload
  readonly facts: Readonly<Record<string, string | number | boolean | null>>;

  // the event itself, kept in the record's erasable fields
  readonly payload: JSONObject;
}

export type TriggerEvent = ScheduleTriggerEvent | TaskInputEvent;

export interface TriggerBatch {
  readonly cursor: JSONValue;
  readonly events: readonly TriggerEvent[];
}

export type SourceHealth = 'running' | 'unhealthy' | 'stopped';

export interface TriggerContext {
  // the last cursor nixie committed for this source; null for the schedule source
  readonly cursor: JSONValue;
  readonly deliver: (batch: TriggerBatch) => Promise<{ readonly delivered: number }>;

  // held in memory by startTriggerSources
  readonly reportHealth: (health: SourceHealth) => void;

  // aborted at stop
  readonly signal: AbortSignal;
}

export interface TriggerSource {
  // stable across restarts, such as 'schedule'
  readonly id: string;
  readonly kind: 'schedule' | 'stream';

  // resolves once the source runs
  readonly start: (context: TriggerContext) => Promise<void>;

  // resolves once no tick is in flight
  readonly stop: () => Promise<void>;
}

export type RetireOneShot = (
  tx: Transaction<unknown>,
  definitionID: string,
  cause: 'one_shot_fired' | 'one_shot_skipped',
) => Promise<void>;

export interface TriggerCoreContext {
  readonly log: Log;

  // the writer's clock: firedAt and recordedAt
  readonly clock: Clock;
  readonly definitions: () => Definitions;

  // health changes
  readonly logEvent: Logger;
  readonly readDefinitionTask: typeof readDefinitionTaskInTransaction;
  readonly retireOneShot: RetireOneShot;
}

// resolves 'owner' to the zone of the newest message, or to the configured default
export type ReadZone = (zone: Schedule['zone']) => Promise<string>;

interface TriggerSourceTable {
  readonly source_id: string;
  readonly cursor: string | null;
  readonly updated_sequence: number;
}

interface TriggerKeyTable {
  readonly source_key: string;
  readonly sequence: number;
}

interface TriggerDefinitionTable {
  readonly definition_id: string;
  readonly source_id: string;

  // null when the definition is withdrawn
  readonly definition_hash: string | null;
  readonly target: 'task' | 'conversation';

  // canonical JSON
  readonly trigger: string;

  // the watermark, epoch milliseconds
  readonly after: number;

  // the slot that a snooze holds and the instant its hold ends, epoch milliseconds
  readonly hold_slot: number | null;
  readonly hold_until: number | null;
  readonly updated_sequence: number;
}

export type TriggersTables = CheckedTables<
  Readonly<{
    trigger_sources: TriggerSourceTable;
    trigger_keys: TriggerKeyTable;
    trigger_definitions: TriggerDefinitionTable;
  }>
>;
