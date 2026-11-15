import { sql } from 'kysely';
import { z } from 'zod';
import type { Migration } from '../types';

export const actionReconciliationMigration: Migration = {
  name: 'add the call, deadline, risk class, hold and reconcile state to each action',
  up: async (tx) => {
    const columns = await sql`select name from pragma_table_info('actions')`.execute(tx);

    const existing = new Set(
      z
        .object({ name: z.string() })
        .array()
        .parse(columns.rows)
        .map((row) => row.name),
    );

    const additions: readonly (readonly [string, string])[] = [
      ['call_sequence', 'integer'],
      ['deadline_at', 'integer'],
      [
        'risk_class',
        `text not null default 'routine' check (risk_class in ('routine', 'always_ask', 'lifting'))`,
      ],
      ['is_approved', 'integer not null default 0 check (is_approved in (0, 1))'],
      ['held_by_proposal_id', 'text'],
      ['unknown_streak', 'integer not null default 0'],
      ['first_attempt_at', 'integer'],
      ['last_attempt_at', 'integer'],
      ['reconcile_at', 'integer'],
    ];

    for (const [name, definition] of additions) {
      if (!existing.has(name)) {
        await sql`alter table actions add column ${sql.ref(name)} ${sql.raw(definition)}`.execute(
          tx,
        );
      }
    }
  },
};
