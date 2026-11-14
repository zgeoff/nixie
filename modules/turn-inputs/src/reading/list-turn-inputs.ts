import type { TurnInputsContext } from '../types';
import { getTurnInputsDB } from '../utils/get-turn-inputs-db';
import type { InputMissReason, InputRemovedCause, InputState } from '../utils/turn-inputs-tables';

export interface LoggedInput {
  readonly inputID: string;
  readonly captureID: string;
  readonly taskID: string;
  readonly stepRunID: string;
  readonly writer: string;
  readonly counter: number;
  readonly role: string;
  readonly profile: string;
  readonly model: string;
  readonly harness: string;
  readonly api: string;
  readonly endpoint: string;
  readonly route: string;
  readonly isRewritten: boolean;
  readonly upstreamStatus: number;
  readonly bytes: number;
  readonly intakeSequence: number;
  readonly receivedAt: number;
  readonly takenAt: number;
  readonly state: InputState;
  readonly removedCause: InputRemovedCause | null;
}

export interface LoggedMiss {
  readonly missID: string;
  readonly captureID: string | null;
  readonly taskID: string;
  readonly stepRunID: string;
  readonly reason: InputMissReason;
  readonly count: number;
  readonly writer: string | null;
  readonly counter: number | null;
  readonly createdAt: number;
}

export interface TurnInputList {
  readonly inputs: readonly LoggedInput[];
  readonly misses: readonly LoggedMiss[];
}

// Newest first. A row never carries its key ID, a body or the sealed key.
export async function listTurnInputs(
  ctx: TurnInputsContext,
  limit: number,
): Promise<TurnInputList> {
  const db = getTurnInputsDB(ctx.log);

  const inputs = await db
    .selectFrom('turn_inputs')
    .select([
      'input_id',
      'capture_id',
      'task_id',
      'step_run_id',
      'writer',
      'counter',
      'role',
      'profile',
      'model',
      'harness',
      'api',
      'endpoint',
      'route',
      'is_rewritten',
      'upstream_status',
      'bytes',
      'intake_sequence',
      'received_at',
      'taken_at',
      'state',
      'removed_cause',
    ])
    .orderBy('taken_at', 'desc')
    .orderBy('intake_sequence', 'desc')
    .limit(limit)
    .execute();

  const misses = await db
    .selectFrom('turn_input_misses')
    .selectAll()
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute();

  return {
    inputs: inputs.map((row) => ({
      inputID: row.input_id,
      captureID: row.capture_id,
      taskID: row.task_id,
      stepRunID: row.step_run_id,
      writer: row.writer,
      counter: row.counter,
      role: row.role,
      profile: row.profile,
      model: row.model,
      harness: row.harness,
      api: row.api,
      endpoint: row.endpoint,
      route: row.route,
      isRewritten: row.is_rewritten === 1,
      upstreamStatus: row.upstream_status,
      bytes: row.bytes,
      intakeSequence: row.intake_sequence,
      receivedAt: row.received_at,
      takenAt: row.taken_at,
      state: row.state,
      removedCause: row.removed_cause,
    })),
    misses: misses.map((row) => ({
      missID: row.miss_id,
      captureID: row.capture_id,
      taskID: row.task_id,
      stepRunID: row.step_run_id,
      reason: row.reason,
      count: row.count,
      writer: row.writer,
      counter: row.counter,
      createdAt: row.created_at,
    })),
  };
}
