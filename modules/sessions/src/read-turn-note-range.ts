import type { Log, RecordKind } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { z } from 'zod';
import type { TurnNoteRange } from './types';

// Kysely's table map needs an index signature, which an interface lacks, so these are mapped types.
type RecordTables = Readonly<{
  records: {
    readonly sequence: number;
    readonly thread: string | null;
    readonly kind: RecordKind;
    readonly payload: string;
  };
}>;

export async function readTurnNoteRange(
  log: Pick<Log, 'writer'>,
  beforeSequence = Number.MAX_SAFE_INTEGER,
): Promise<TurnNoteRange> {
  const db = log.writer.db.$extendTables<RecordTables>();

  const last = await db
    .selectFrom('records')
    .select(['sequence', 'payload'])
    .where('thread', '=', conversationTaskID)
    .where('kind', '=', 'model.turn_ended')
    .where('sequence', '<', beforeSequence)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  const head = await db
    .selectFrom('records')
    .select((eb) => eb.fn.max('sequence').as('head'))
    .executeTakeFirst();

  return { after: getNotedThrough(last), through: head?.head ?? 0 };
}

const turnEnded = z.object({ memoryNotedThrough: z.int().optional() });

function getNotedThrough(
  last: { readonly sequence: number; readonly payload: string } | undefined,
): number {
  if (last === undefined) {
    return 0;
  }

  const payload = turnEnded.safeParse(JSON.parse(last.payload));

  return payload.success ? (payload.data.memoryNotedThrough ?? last.sequence) : last.sequence;
}
