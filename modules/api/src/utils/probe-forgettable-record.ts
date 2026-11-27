import { forgettableKinds } from '@heynixie/contract';
import type { RecordKind } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { APITables } from '../types';
import { placeErasableKinds } from './place-erasable-kinds';

// The contract lib cannot see the log's kinds, so this check keeps the list inside them.
const kinds = forgettableKinds satisfies readonly RecordKind[];

interface ForgettableRecordTarget {
  readonly thread: string;
  readonly sequence: number;
}

export async function probeForgettableRecord(
  db: Kysely<unknown>,
  target: ForgettableRecordTarget,
): Promise<boolean> {
  const row = await db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select('sequence')
    .where('sequence', '=', target.sequence)
    .where((eb) =>
      eb.or([
        eb('thread', '=', target.thread),
        eb.and([eb('thread', 'is', null), eb('kind', 'in', placeErasableKinds)]),
      ]),
    )
    .where('kind', 'in', kinds)
    .executeTakeFirst();

  return row !== undefined;
}
