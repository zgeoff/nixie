// `bun run --cwd libs/contract openapi` writes the contract's OpenAPI document to openapi.json, and
// a contract change commits the new file in the same pull request.
import { join } from 'node:path';
import { buildOpenAPIDocument } from './build-openapi-document';

const path = join(import.meta.dir, '..', 'openapi.json');
const document = await buildOpenAPIDocument();

await Bun.write(path, `${JSON.stringify(document, null, 2)}\n`);
process.stdout.write(`wrote ${path}\n`);
