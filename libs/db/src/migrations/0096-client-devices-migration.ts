import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { createShortID } from '../migration/create-short-id';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

export const clientDevicesMigration: Migration = {
  name: 'give each full session a client device row',
  up: async (tx) => {
    const columns = await sql`
      select name from pragma_table_info('devices') where name = 'device_kind'`.execute(tx);

    if (columns.rows.length === 0) {
      await sql`alter table devices add column device_kind text not null default 'screen'`.execute(
        tx,
      );
    }

    await sql`update devices set device_kind = 'client'
      where identity_id in (select identity_id from identities where scope = 'full')`.execute(tx);

    await writeClientRows(tx);
  },
};

async function writeClientRows(tx: Transaction<unknown>): Promise<void> {
  const sessions = await readQueryRows(
    sql`select identity_id, label, paired_at from identities
      where scope = 'full'
        and channel = 'client'
        and revoked_at is null
        and identity_id not in (select identity_id from devices)`,
    tx,
    z.object({ identity_id: z.string(), label: z.string(), paired_at: z.number() }),
  );

  for (const session of sessions) {
    await sql`insert into devices (
        device_id, identity_id, name, capabilities, shown_sequence, idle_sequence, updated_at,
        device_kind
      ) values (
        ${createShortID()},
        ${session.identity_id},
        ${session.label},
        ${JSON.stringify({ screen: true, camera: false, speaker: false, microphone: false })},
        null,
        null,
        ${session.paired_at},
        'client'
      )`.execute(tx);
  }
}
