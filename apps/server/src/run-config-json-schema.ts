// `bun run --cwd apps/server config-schema` writes the deployment configuration's JSON Schema to
// config.schema.json, and a configuration change commits the new file in the same pull request.
import { join } from 'node:path';
import { buildConfigJSONSchema } from './build-config-json-schema';

const path = join(import.meta.dir, '..', 'config.schema.json');

await Bun.write(path, `${JSON.stringify(buildConfigJSONSchema(), null, 2)}\n`);

process.stdout.write(`wrote ${path}\n`);
