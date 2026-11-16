import { readRecords } from '@heynixie/log';
import { readRunRows } from '../run/read-run-rows';
import type { TaskRun } from '../run/types';
import { parseTriggerFired } from '../task/codec/trigger-fired-codec';
import type { TriggerFired } from '../task/codec/trigger-fired-codec';
import type { TasksContext } from '../types';
import type { DatedFire } from './build-trigger-details';

export interface RunFire {
  // the record that opened the first task run of the chain
  readonly sequence: number;
  readonly fire: TriggerFired & DatedFire;
  readonly startedAt: Date;
  readonly definitionHash: string | null;
}

// The fire that opened the work of a task run: the fire of the first task run of the chain that
// the run carries on. Null for a task run that no fire opened, a fire that no longer decodes, and
// a poll fire.
export async function readRunFire(
  context: Pick<TasksContext, 'log'>,
  run: TaskRun,
): Promise<RunFire | null> {
  const first = await readFirstRun(context, run);

  if (first.opened.origin.kind !== 'trigger' || first.opened.origin.sequence === null) {
    return null;
  }

  const sequence = first.opened.origin.sequence;

  const [entry] = await readRecords(context.log, {
    afterSequence: sequence - 1,
    sequences: [sequence],
    kinds: ['trigger.fired'],
    limit: 1,
  });

  const fire = entry === undefined ? null : parseTriggerFired(entry.record.payload);

  if (fire === null || fire.kind === 'poll') {
    return null;
  }

  return {
    sequence,
    fire: { ...fire, kind: fire.kind },
    startedAt: first.startedAt,
    definitionHash: first.opened.definitionHash,
  };
}

async function readFirstRun(context: Pick<TasksContext, 'log'>, run: TaskRun): Promise<TaskRun> {
  if (run.opened.carriesRunID === null) {
    return run;
  }

  const runs = await readRunRows(context.log.writer.db, run.taskID);

  let current = run;

  while (current.opened.carriesRunID !== null) {
    const carriedID = current.opened.carriesRunID;
    const carried = runs.find((candidate) => candidate.runID === carriedID);

    if (carried === undefined) {
      return current;
    }

    current = carried;
  }

  return current;
}
