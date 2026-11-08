import { join } from 'node:path';
import { buildRulesJSONSchema } from './build-rules-json-schema';

const path = join(import.meta.dir, '..', 'definitions-rules.schema.json');

await Bun.write(path, `${JSON.stringify(buildRulesJSONSchema(), null, 2)}\n`);

process.stdout.write(`wrote ${path}\n`);
