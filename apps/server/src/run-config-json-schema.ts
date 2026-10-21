import { join } from 'node:path';
import { buildConfigJSONSchema } from './build-config-json-schema';

const path = join(import.meta.dir, '..', 'config.schema.json');

await Bun.write(path, `${JSON.stringify(buildConfigJSONSchema(), null, 2)}\n`);

process.stdout.write(`wrote ${path}\n`);
