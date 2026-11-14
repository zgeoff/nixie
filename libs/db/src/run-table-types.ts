import { join } from 'node:path';
import { readBuiltTables } from './migration/read-built-tables';
import { renderTableTypes } from './migration/render-table-types';
import { nixieSchema } from './schema/nixie-schema';

const path = join(import.meta.dir, 'nixie-tables.ts');

const tables = await readBuiltTables(nixieSchema);

await Bun.write(path, renderTableTypes(tables));

process.stdout.write(`wrote ${path}\n`);
