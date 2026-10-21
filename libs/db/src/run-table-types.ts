import { join } from 'node:path';
import { nixieSchema } from './nixie-schema';
import { readBuiltTables } from './read-built-tables';
import { renderTableTypes } from './render-table-types';

const path = join(import.meta.dir, 'nixie-tables.ts');

const tables = await readBuiltTables(nixieSchema);

await Bun.write(path, renderTableTypes(tables));

process.stdout.write(`wrote ${path}\n`);
