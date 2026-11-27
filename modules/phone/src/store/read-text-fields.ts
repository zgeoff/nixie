import { readRecords } from '@heynixie/log';
import type { Log } from '@heynixie/log';
import { phoneTextFieldsSchema } from '../record/phone-text-received-codec';
import type { PhoneTables } from '../types';

export interface StoredTextFields {
  readonly from: string;
  readonly body: string;
}

// The sender and the body of each stored text by the sequence of its record. A text whose fields
// were forgotten has none.
export async function readTextFields(
  log: Log,
  rows: readonly PhoneTables['phone_texts'][],
): Promise<ReadonlyMap<number, StoredTextFields>> {
  const fields = new Map<number, StoredTextFields>();

  if (rows.length === 0) {
    return fields;
  }

  const records = await readRecords(log, {
    afterSequence: 0,
    sequences: rows.map((row) => row.record_sequence),
    limit: rows.length,
  });

  for (const entry of records) {
    const erasable = entry.record.erasable;

    if (erasable.status === 'readable') {
      fields.set(entry.record.sequence, phoneTextFieldsSchema.parse(erasable.fields));
    }
  }

  return fields;
}
