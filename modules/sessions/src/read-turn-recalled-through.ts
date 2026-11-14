import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { StepInput, TasksContext } from '@heynixie/tasks';
import { memoryRecalledCodec } from './memory-recalled-codec';
import { readRecalledThrough } from './read-recalled-through';

const windowSize = 1000;

// A recall counts as held only when its tool result comes before the point the turn ends at. The
// result of a recall that finishes after an interrupt never reaches the model.
export async function readTurnRecalledThrough(
  context: Pick<TasksContext, 'log'>,
  input: Pick<StepInput, 'taskID' | 'stepKey'>,
): Promise<number> {
  const interrupts = await readRecords(context.log, {
    afterSequence: 0,
    thread: input.taskID,
    kinds: ['task.interrupted'],
    order: 'newest',
    limit: 5,
  });

  const interrupt = interrupts.find((entry) => entry.record.payload['stepKey'] === input.stepKey);

  if (interrupt === undefined) {
    return readRecalledThrough(context, input.taskID);
  }

  const interruptedAt = interrupt.record.sequence;

  const [started] = await readRecords(context.log, {
    afterSequence: 0,
    beforeSequence: interruptedAt,
    thread: input.taskID,
    kinds: ['task.step_started'],
    order: 'newest',
    limit: 1,
  });

  const entries = await readRecords(context.log, {
    afterSequence: started?.record.sequence ?? 0,
    beforeSequence: interruptedAt,
    thread: input.taskID,
    kinds: ['memory.recalled', 'tool_called', 'tool_result'],
    order: 'newest',
    limit: windowSize,
  });

  return pickHeldRecallSequence(entries.map((entry) => entry.record));
}

interface HeldWalk {
  readonly resulted: ReadonlySet<number>;
  readonly awaiting: readonly number[];
  readonly held: readonly number[];
}

// The records come newest first, so a tool result is met before its call. A recall belongs to the
// nearest tool call before it. A turn note belongs to no tool call, so it is held.
function pickHeldRecallSequence(records: readonly LogRecord[]): number {
  const walk = records.reduce<HeldWalk>((state, record) => collectHeld(state, record), {
    resulted: new Set(),
    awaiting: [],
    held: [],
  });

  return Math.max(0, ...walk.held);
}

function collectHeld(walk: HeldWalk, record: LogRecord): HeldWalk {
  if (record.kind === 'tool_result') {
    return record.parent === null
      ? walk
      : { ...walk, resulted: new Set([...walk.resulted, record.parent]) };
  }

  if (record.kind === 'tool_called') {
    return {
      ...walk,
      awaiting: [],
      held: walk.resulted.has(record.sequence) ? [...walk.held, ...walk.awaiting] : walk.held,
    };
  }

  const isTurnNote = memoryRecalledCodec.tryDecodePartial(record.payload)?.isTurnNote === true;

  return isTurnNote
    ? { ...walk, held: [...walk.held, record.sequence] }
    : { ...walk, awaiting: [...walk.awaiting, record.sequence] };
}
