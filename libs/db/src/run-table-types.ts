// `bun run --cwd libs/db tables` writes the type of every table that nixieSchema builds to
// nixie-tables.ts, and a migration commits the new file in the same pull request.
import { join } from 'node:path';
import { nixieSchema } from './nixie-schema';
import { readBuiltTables } from './read-built-tables';
import { renderTableTypes } from './render-table-types';

const path = join(import.meta.dir, 'nixie-tables.ts');

const tables = await readBuiltTables(nixieSchema);

await Bun.write(path, renderTableTypes(tables));

process.stdout.write(`wrote ${path}\n`);
