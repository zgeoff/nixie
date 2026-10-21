import { join } from 'node:path';
import { buildManifestJSONSchema } from './build-manifest-json-schema';

const path = join(import.meta.dir, '..', 'definitions-manifest.schema.json');

await Bun.write(path, `${JSON.stringify(buildManifestJSONSchema(), null, 2)}\n`);

process.stdout.write(`wrote ${path}\n`);
