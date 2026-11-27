import type { WriteTransaction } from '@heynixie/log';
import { sql } from 'kysely';
import { z } from 'zod';

export interface TextCopy {
  readonly sequence: number;

  // the thread of the record
  readonly thread: string | null;

  // the key that seals the copy; null once removed
  readonly keyID: string | null;
}

export interface TextCopies {
  // the arrival of the text, whose key stays until no held match needs it
  readonly arrivals: readonly TextCopy[];

  // the wakes that showed the text, whose mails share one key
  readonly wakes: readonly TextCopy[];
}

// The copies of a text that sit outside its own record: its arrival and every wake that showed it,
// found by the text's short ID in the text source's mailbox.
export async function readTextCopies(
  tx: WriteTransaction,
  mailbox: string,
  shortID: string,
): Promise<TextCopies> {
  const arrivals = await sql`
    select sequence, thread, key_id
    from records
    where kind = 'trigger.mail_arrived'
      and json_extract(payload, '$.mailbox') = ${mailbox}
      and json_extract(payload, '$.messageID') = ${shortID}
    order by sequence
  `.execute(tx);

  const wakes = await sql`
    select sequence, thread, key_id
    from records
    where kind = 'trigger.mail_woke'
      and thread is not null
      and exists (
        select 1 from json_each(records.payload, '$.mails')
        where json_extract(json_each.value, '$.mailbox') = ${mailbox}
          and json_extract(json_each.value, '$.messageID') = ${shortID}
      )
    order by sequence
  `.execute(tx);

  return { arrivals: arrivals.rows.map(toCopy), wakes: wakes.rows.map(toCopy) };
}

const rowSchema = z.object({
  sequence: z.int(),
  thread: z.string().nullable(),
  key_id: z.string().nullable(),
});

function toCopy(row: unknown): TextCopy {
  const parsed = rowSchema.parse(row);

  return { sequence: parsed.sequence, thread: parsed.thread, keyID: parsed.key_id };
}
