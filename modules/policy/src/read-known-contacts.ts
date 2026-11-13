import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { PolicyTables } from './policy-tables';
import type { KnownContact } from './types';

export interface KnownContactEntry extends KnownContact {
  readonly markedAt: number;
}

const detailsSchema = z.object({ name: z.string().nullable(), destination: z.string() });

export async function readKnownContactIDs(db: Kysely<unknown>): Promise<readonly string[]> {
  const rows = await db
    .$extendTables<PolicyTables>()
    .selectFrom('known_contacts')
    .select('contact_id')
    .where('unmarked_sequence', 'is', null)
    .orderBy('contact_id')
    .execute();

  return rows.map((row) => row.contact_id);
}

// A contact whose marking record a forget erased keeps its row and has no details.
export async function readKnownContacts(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  contactIDs?: readonly string[],
): Promise<readonly KnownContactEntry[]> {
  const rows = await log.writer.db
    .$extendTables<PolicyTables>()
    .selectFrom('known_contacts')
    .select(['contact_id', 'marked_sequence'])
    .where('unmarked_sequence', 'is', null)
    .$if(contactIDs !== undefined, (query) => query.where('contact_id', 'in', contactIDs ?? []))
    .orderBy('marked_sequence')
    .execute();

  return Promise.all(
    rows.map(async (row) => {
      const [entry] = await readRecords(log, {
        afterSequence: row.marked_sequence - 1,
        limit: 1,
      });

      const erasable = entry?.record.erasable;
      const details = erasable?.status === 'readable' ? detailsSchema.parse(erasable.fields) : null;

      return {
        contactID: row.contact_id,
        name: details?.name ?? null,
        destination: details?.destination ?? null,
        markedAt: entry?.record.recordedAt.getTime() ?? 0,
      };
    }),
  );
}
