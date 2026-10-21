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
  readonly onError: (error: unknown) => void;
}

export interface MemoryWriter {
  readonly runStep: RunStep;
  readonly readStatus: () => Promise<WriterStatus>;
  readonly stop: () => Promise<void>;
}

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
