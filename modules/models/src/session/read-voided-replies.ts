import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import type { ReplyVoidReason } from './model-reply-voided-codec';
import { modelReplyVoidedCodec, replyVoidReasonSchema } from './model-reply-voided-codec';

const rowSchema = z.object({
  reply_sequence: z.int(),
  reason: replyVoidReasonSchema,
});

// The kind is a literal, not a bound value, so that SQLite can prove the lookup fits the partial
// index of the replies a void names.
export async function readVoidedReplies(
  db: Kysely<unknown>,
  sequences: readonly number[],
): Promise<ReadonlyMap<number, ReplyVoidReason>> {
  if (sequences.length === 0) {
    return new Map();
  }

  const rows = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select([
      sql`json_extract(payload, '$.replySequence')`.as('reply_sequence'),
      sql`json_extract(payload, '$.reason')`.as('reason'),
    ])
    .where('kind', '=', sql.lit(modelReplyVoidedCodec.kind))
    .where(sql`json_extract(payload, '$.replySequence')`, 'in', sequences)
    .orderBy('sequence', 'asc')
    .execute();

  return new Map(
    rows.map((row) => {
      const parsed = rowSchema.parse(row);

      return [parsed.reply_sequence, parsed.reason] as const;
    }),
  );
}
