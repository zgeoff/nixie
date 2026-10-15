import type { Log } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { z } from 'zod';
import type { TurnNoteRange } from './types';

// Reads the range the conversation's next turn note covers: after the sequence the last turn's note
// covered, through the log's head now. Given a sequence, the last turn is the newest before it.
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

  return { after: findNotedThrough(last), through: head?.head ?? 0 };
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
type RecordTables = Readonly<{
  records: {
    readonly sequence: number;
    readonly thread: string | null;
    readonly kind: string;
    readonly payload: string;
  };
}>;

// the turn's end record keeps the sequence its note covered under the name the memory note gave it
const turnEnded = z.object({ memoryNotedThrough: z.int().optional() });

function findNotedThrough(
  last: { readonly sequence: number; readonly payload: string } | undefined,
): number {
  if (last === undefined) {
    return 0;
  }

  const payload = turnEnded.safeParse(JSON.parse(last.payload));

  return payload.success ? (payload.data.memoryNotedThrough ?? last.sequence) : last.sequence;
}
