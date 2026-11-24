import type { KeyStoreTables, Log, LogTables } from '../types';
import type { ErasureCapture } from './erasure-capture-schema';

const chunkSize = 500;

// How many keys of the key store a capture names right now. The start records the count, because a
// crash after the keys go would otherwise leave nothing to count.
export async function countErasureKeys(
  log: Pick<Log, 'writer'>,
  capture: Pick<ErasureCapture, 'keys' | 'cleanupKeys'>,
): Promise<number> {
  const keys = log.writer.keys.$extendTables<KeyStoreTables>();

  const named = await readNamedKeyIDs(log, capture);

  const found = { count: 0 };

  for (let start = 0; start < named.length; start += chunkSize) {
    const row = await keys
      .selectFrom('record_keys')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('key_id', 'in', named.slice(start, start + chunkSize))
      .executeTakeFirst();

    found.count += Number(row?.count ?? 0);
  }

  if ('family' in capture.keys) {
    const rootID = capture.keys.family;

    const family = await keys
      .selectFrom('record_keys')
      .select((eb) => eb.fn.countAll().as('count'))
      .where((eb) =>
        eb.or([
          eb('key_id', '=', rootID),
          eb.and([eb('key_id', '>=', `${rootID}/`), eb('key_id', '<', `${rootID}0`)]),
        ]),
      )
      .executeTakeFirst();

    found.count += Number(family?.count ?? 0);
  }

  return found.count;
}

async function readNamedKeyIDs(
  log: Pick<Log, 'writer'>,
  capture: Pick<ErasureCapture, 'keys' | 'cleanupKeys'>,
): Promise<readonly string[]> {
  if ('ids' in capture.keys) {
    return [...capture.keys.ids, ...capture.cleanupKeys];
  }

  if ('thread' in capture.keys) {
    const rows = await log.writer.db
      .$extendTables<LogTables>()
      .selectFrom('records')
      .select('key_id')
      .distinct()
      .where('thread', '=', capture.keys.thread)
      .where('key_id', 'is not', null)
      .execute();

    return [
      ...rows.flatMap((row) => (row.key_id === null ? [] : [row.key_id])),
      ...capture.cleanupKeys,
    ];
  }

  return capture.cleanupKeys;
}
