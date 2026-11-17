import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

const rowSchema = z.object({ definition_hash: z.string(), files: z.string() });
const filesSchema = z.record(z.string(), z.string());

// Versions stored before this release hold task.yaml as one line of JSON, which the definitions
// repo's format check rejects. Rewriting stored text is no expand step, so the oldest reader rises.
// The rendering is a copy of the definitions module's, so a later change there leaves this alone.
export const taskYAMLTextMigration: Migration = {
  name: 'store each runtime task.yaml as block YAML',
  up: async (tx) => {
    const rows = await readQueryRows(
      sql`select definition_hash, files from task_definition_versions`,
      tx,
      rowSchema,
    );

    for (const row of rows) {
      const files = filesSchema.safeParse(JSON.parse(row.files));

      if (!files.success) {
        continue;
      }

      let changed = false;
      const rewritten: Record<string, string> = {};

      for (const [path, text] of Object.entries(files.data)) {
        const yaml = path.endsWith('/task.yaml') ? buildBlockYAML(text) : null;

        rewritten[path] = yaml ?? text;
        changed ||= yaml !== null;
      }

      if (changed) {
        await sql`update task_definition_versions set files = ${JSON.stringify(rewritten)}
          where definition_hash = ${row.definition_hash}`.execute(tx);
      }
    }
  },
};

const mappingSchema = z.record(z.string(), z.unknown());

// The block YAML of a text that is exactly the old writer's output, or null for any other text.
function buildBlockYAML(text: string): string | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const mapping = mappingSchema.safeParse(parsed);

  if (!mapping.success || JSON.stringify(mapping.data) !== text) {
    return null;
  }

  return `${Bun.YAML.stringify(mapping.data, null, 2).replace(/\n+$/u, '')}\n`;
}
