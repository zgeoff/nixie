import { sql } from 'kysely';
import { erasureStartedCodec } from '../erasure/erasure-started-codec';
import { parseJSONObject } from '../record/parse-json-object';
import type { Log, LogTables } from '../types';
import type { ForgetCoverage } from './types';

// What every erasure that began has named for removal: key IDs, key families and threads. A key
// that is gone and sits outside all of it left by retention. An expiry names the keys of the
// payloads it removes, but it is retention, so it adds nothing here.
export async function readForgetCoverage(log: Pick<Log, 'writer'>): Promise<ForgetCoverage> {
  const rows = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('payload')
    .where('kind', '=', 'erasure.started')
    .where(sql`json_extract(payload, '$.kind')`, '!=', 'expiry')
    .execute();

  const keyIDs = new Set<string>();

  const families: string[] = [];

  const threads = new Set<string>();

  for (const row of rows) {
    const capture = erasureStartedCodec.decode(parseJSONObject(row.payload)).capture;

    for (const keyID of capture.cleanupKeys) {
      keyIDs.add(keyID);
    }

    if ('ids' in capture.keys) {
      for (const keyID of capture.keys.ids) {
        keyIDs.add(keyID);
      }
    }

    if ('family' in capture.keys) {
      families.push(capture.keys.family);
    }

    if ('thread' in capture.keys) {
      threads.add(capture.keys.thread);
    }
  }

  return { keyIDs, families, threads };
}
