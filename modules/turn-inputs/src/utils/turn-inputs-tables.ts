import type { CheckedTables } from '@heynixie/db';

export type InputMissReason =
  | 'queue_full'
  | 'spool_full'
  | 'spool_write_failed'
  | 'seal_failed'
  | 'no_capture_point'
  | 'not_received'
  | 'undecodable'
  | 'capture_closed'
  | 'intake_failed'
  | 'holds_own_value';

export type CaptureCloseCause = 'step_end' | 'start' | 'forget' | 'off' | 'reset';

export type InputRemovedCause =
  | 'retention_days'
  | 'retention_bytes'
  | 'forget'
  | 'dropped'
  | 'restore';

export type InputState = 'writing' | 'stored' | 'missing' | 'removed';

interface CaptureTable {
  readonly capture_id: string;
  readonly task_id: string;
  readonly step_run_id: string;
  readonly role: string;
  readonly profile: string;
  readonly model: string;
  readonly harness: string;
  readonly source: string;
  readonly key_id: string | null;
  readonly sealed_private_key: Uint8Array<ArrayBuffer> | null;
  readonly state: 'open' | 'closed';
  readonly close_cause: CaptureCloseCause | null;
  readonly opened_at: number;
  readonly closed_at: number | null;
  readonly call_frames: number | null;
  readonly inputs: number;
  readonly misses: number;
}

interface InputTable {
  readonly input_id: string;
  readonly capture_id: string;
  readonly task_id: string;
  readonly step_run_id: string;
  readonly writer: string;
  readonly counter: number;
  readonly role: string;
  readonly profile: string;
  readonly model: string;
  readonly harness: string;
  readonly api: string;
  readonly endpoint: string;
  readonly route: string;
  readonly is_rewritten: number;
  readonly upstream_status: number;
  readonly bytes: number;
  readonly key_id: string;
  readonly intake_sequence: number;
  readonly received_at: number;
  readonly taken_at: number;
  readonly state: InputState;
  readonly removed_cause: InputRemovedCause | null;
}

interface MissTable {
  readonly miss_id: string;
  readonly capture_id: string | null;
  readonly task_id: string;
  readonly step_run_id: string;
  readonly reason: InputMissReason;
  readonly count: number;
  readonly writer: string | null;
  readonly counter: number | null;
  readonly created_at: number;
}

export type TurnInputsTables = CheckedTables<
  Readonly<{
    turn_input_captures: CaptureTable;
    turn_inputs: InputTable;
    turn_input_misses: MissTable;
  }>
>;
