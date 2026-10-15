import { subscribeToRecords, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Log } from '@heynixie/log';
import type { RunStep, TasksContext } from '@heynixie/tasks';
import { conversationTaskID, createSystemTask, writeInboxRecords } from '@heynixie/tasks';
import { memoryWriterTaskID } from './memory-writer-task-id';
import type { WriterStatus } from './read-writer-status';
import { readWriterStatus } from './read-writer-status';
import { runWriterStep } from './run-writer-step';
import type { WriterParts } from './writer-parts';
import type { WriterTables } from './writer-types';

export interface MemoryWriterOptions extends WriterParts {
  // the wake watch failed, such as when another process took the writer
  readonly onError: (error: unknown) => void;
}

export interface MemoryWriter {
  readonly runStep: RunStep;
  readonly readStatus: () => Promise<WriterStatus>;
  readonly stop: () => Promise<void>;
}

// Puts the memory writer into service as a system task, before any runner claims work. Its first
// start records where memory started, so the catch-up covers every earlier record. Each start
// wakes the writer, and so does each later message of yours, with the time it arrived.
export async function startMemoryWriter(options: MemoryWriterOptions): Promise<MemoryWriter> {
  const context = options.context;

  const head = await readHeadSequence(context.log);

  await createSystemTask(context, memoryWriterTaskID);
  await writeWriterStarted(context, head);
  await writeWake(context, {});

  const stopping = new AbortController();

  const watching = runMessageWakes(context, {
    after: head,
    signal: stopping.signal,
    onError: options.onError,
  });

  return {
    runStep: (input) => runWriterStep(options, input),
    readStatus: () => readWriterStatus(context.log),
    stop: async () => {
      stopping.abort();

      await watching;
    },
  };
}

async function readHeadSequence(log: Pick<Log, 'writer'>): Promise<number> {
  const row = await log.writer.db
    .$extendTables<{ records: { sequence: number } }>()
    .selectFrom('records')
    .select((eb) => eb.fn.max('sequence').as('head'))
    .executeTakeFirst();

  return row?.head ?? 0;
}

// the writer's row, created once with the sequence at which memory started
async function writeWriterStarted(context: TasksContext, head: number): Promise<void> {
  await withWriteTransaction(context.log.writer, async (tx) => {
    const existing = await tx
      .$extendTables<WriterTables>()
      .selectFrom('memory_writer')
      .select('writer_id')
      .where('writer_id', '=', memoryWriterTaskID)
      .executeTakeFirst();

    if (existing !== undefined) {
      return;
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'memory.writer_started',
        definitions: context.definitions(),
        thread: memoryWriterTaskID,
        payload: { startSequence: head, at: context.clock.now() },
      },
    ]);
  });
}

// A wake for one of your messages records when it arrived. The wake at start names no message,
// because a message from before the start has waited long enough already.
interface WakeMessage {
  readonly messageSequence?: number;
}

async function writeWake(context: TasksContext, message: WakeMessage): Promise<void> {
  await writeInboxRecords(context, [
    {
      kind: 'task.wake',
      definitions: context.definitions(),
      thread: memoryWriterTaskID,
      payload: { ...message, at: context.clock.now() },
    },
  ]);
}

interface MessageWakes {
  readonly after: number;
  readonly signal: AbortSignal;
  readonly onError: (error: unknown) => void;
}

// Wakes the writer for each message of yours after the start. A wake lost to a crash costs
// nothing: the next start wakes the writer, and a message with no wake has waited long enough.
async function runMessageWakes(context: TasksContext, wakes: MessageWakes): Promise<void> {
  try {
    for await (const entry of subscribeToRecords(context.log, {
      afterSequence: wakes.after,
      thread: conversationTaskID,
      signal: wakes.signal,
    })) {
      if (entry.record.kind === 'owner_message') {
        await writeWake(context, { messageSequence: entry.record.sequence });
      }
    }
  } catch (error) {
    if (!wakes.signal.aborted) {
      wakes.onError(error);
    }
  }
}
