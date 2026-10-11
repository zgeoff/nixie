import type { OpenAPI } from '@orpc/openapi';
import { OpenAPIGenerator } from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { contract } from './contract';

// The contract as an OpenAPI document, which the compatibility check diffs against the last
// release's copy of openapi.json. The info block is fixed, so the document changes only when the
// contract does.
export function buildOpenAPIDocument(): Promise<OpenAPI.Document> {
  const generator = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] });

  return generator.generate(contract, { info: { title: 'nixie', version: '0' } });
}
