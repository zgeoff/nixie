import type { ErasureStart, LogTables, WriteTransaction } from '@heynixie/log';
import { ErasureRefusedError } from '@heynixie/log';
import { buildMailboxKey } from '@heynixie/triggers';
import { phoneSourceID } from '../source/phone-source-id';
import type { PhoneTables } from '../types';
import { readTextCopies } from './read-text-copies';

export interface TextErasureRequest {
  // a text's short ID, or its ID
  readonly text: string;
}

// The start transaction of a forget of one text. It refuses a text that is unknown, and captures the keys of its record, its arrival and every wake that showed it, with
// the wakes' threads, whose sessions and captured requests hold the text.
export async function startTextErasure(
  tx: WriteTransaction,
  request: TextErasureRequest,
): Promise<ErasureStart> {
  const row = await tx
    .$extendTables<PhoneTables>()
    .selectFrom('phone_texts')
    .selectAll()
    .where((eb) => eb.or([eb('short_id', '=', request.text), eb('text_id', '=', request.text)]))
    .executeTakeFirst();

  if (row === undefined) {
    throw new ErasureRefusedError('not_found');
  }

  const copies = await readTextCopies(
    tx,
    buildMailboxKey({ kind: 'source', sourceID: phoneSourceID }),
    row.short_id,
  );

  const recordKey = await tx
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', row.record_sequence)
    .executeTakeFirst();

  const keyIDs = [
    recordKey?.key_id,
    ...[...copies.arrivals, ...copies.wakes].map((copy) => copy.keyID),
  ];

  const threads = [
    ...new Set(copies.wakes.flatMap((wake) => (wake.thread === null ? [] : [wake.thread]))),
  ];

  const floor = threads.length === 0 ? null : await readNextSequence(tx);

  return {
    target: { kind: 'phone_text', targetID: row.text_id, version: null },
    shortID: row.short_id,
    capture: {
      keys: {
        ids: [
          ...new Set(
            keyIDs.flatMap((keyID) => (keyID === null || keyID === undefined ? [] : [keyID])),
          ),
        ],
      },
      cleanupKeys: [],
      sandboxCallIDs: [],
      purges: [],
      sessionCause: {
        textID: row.text_id,
        wakeSequences: copies.wakes.map((wake) => wake.sequence),
      },

      // A wake's text reaches every request on the woken task's thread from the wake on. The floor
      // sits past the last record, so no other thread loses a request.
      turnInputs:
        threads.length === 0
          ? { threads: 'none', cleaned: false, floor: null }
          : { threads, cleaned: false, floor },
    },
  };
}

// The sequence that the next record takes: past the last record of the log.
async function readNextSequence(tx: WriteTransaction): Promise<number> {
  const row = await tx
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select((eb) => eb.fn.max('sequence').as('last'))
    .executeTakeFirst();

  return (row?.last ?? 0) + 1;
}
