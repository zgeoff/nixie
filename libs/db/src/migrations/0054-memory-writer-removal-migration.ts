import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

export const memoryWriterRemovalMigration: Migration = {
  name: "drop the memory writer's table and the session prompt's instruction override",
  up: async (tx) => {
    await sql`delete from projection_changes where projection = 'memory_writer'`.execute(tx);
    await sql`drop table if exists memory_writer`.execute(tx);

    await removeSnapshotOverrides(tx);
    await removeApprovalOverrides(tx);
  },
};

const recordSchema = z.record(z.string(), z.unknown());
const removedPart = 'instruction';

async function removeSnapshotOverrides(tx: Transaction<unknown>): Promise<void> {
  const rows = await readQueryRows(
    sql`select snapshot_hash, form from definition_snapshots where form like ${'%instruction%'}`,
    tx,
    z.object({ snapshot_hash: z.string(), form: z.string() }),
  );

  for (const row of rows) {
    const form = recordSchema.safeParse(JSON.parse(row.form));
    const prompts = recordSchema.safeParse(form.data?.['prompts']);
    const session = recordSchema.safeParse(prompts.data?.['session']);
    const parts = recordSchema.safeParse(session.data?.['parts']);

    if (!form.success || !prompts.success || !session.success || !parts.success) {
      continue;
    }

    const template = z.string().safeParse(session.data['template']);
    const isTemplateStale = template.success && template.data.includes(`parts.${removedPart}`);

    if (!(removedPart in parts.data) && !isTemplateStale) {
      continue;
    }

    const kept = Object.fromEntries(
      Object.entries(parts.data).filter(([part]) => part !== removedPart),
    );

    const keptTemplate = isTemplateStale ? null : (session.data['template'] ?? null);
    const isEmpty = Object.keys(kept).length === 0 && keptTemplate === null;

    const rest = Object.fromEntries(
      Object.entries(prompts.data).filter(([id]) => id !== 'session'),
    );

    const rewritten = isEmpty
      ? rest
      : { ...rest, session: { ...session.data, parts: kept, template: keptTemplate } };

    const { prompts: _removed, ...others } = form.data;

    const rewrittenForm =
      Object.keys(rewritten).length === 0 ? others : { ...others, prompts: rewritten };

    await sql`update definition_snapshots
      set form = ${JSON.stringify(rewrittenForm)}
      where snapshot_hash = ${row.snapshot_hash}`.execute(tx);
  }
}

async function removeApprovalOverrides(tx: Transaction<unknown>): Promise<void> {
  const rows = await readQueryRows(
    sql`select approval_id, entry, files from prompt_approvals
      where prompt_id = 'session' and entry like ${'%"instruction"%'}`,
    tx,
    z.object({ approval_id: z.string(), entry: z.string(), files: z.string() }),
  );

  for (const row of rows) {
    const entry = z.record(z.string(), z.string()).safeParse(JSON.parse(row.entry));
    const files = z.array(z.looseObject({ path: z.string() })).safeParse(JSON.parse(row.files));
    const path = entry.data?.[removedPart];

    if (!entry.success || !files.success || path === undefined) {
      continue;
    }

    const kept = Object.fromEntries(
      Object.entries(entry.data).filter(([key]) => key !== removedPart),
    );

    const keptFiles = files.data.filter((file) => file.path !== path);

    await sql`update prompt_approvals
      set entry = ${JSON.stringify(kept)}, files = ${JSON.stringify(keptFiles)}
      where approval_id = ${row.approval_id}`.execute(tx);
  }
}
