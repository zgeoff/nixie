import type { OpenAPI } from '@orpc/openapi';
import { OpenAPIGenerator } from '@orpc/openapi';
import { JSON_SCHEMA_REGISTRY, ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { contract } from './contract';
import { reviewReasonSchema } from './memory-view-contract';

// The contract as an OpenAPI document, which the compatibility check diffs against the last
// release's copy of openapi.json. The info block is fixed, so the document changes only when the
// contract does.
export function buildOpenAPIDocument(): Promise<OpenAPI.Document> {
  // the review reasons as an extensible enum in place of a closed one, so the compatibility check
  // lets a release add a reason; the converter spreads this over its own schema, and the undefined
  // enum drops the closed list from the document
  const extensibleReasons = {
    type: 'string' as const,
    'x-extensible-enum': [...reviewReasonSchema.options],
  };

  JSON_SCHEMA_REGISTRY.add(reviewReasonSchema, { ...extensibleReasons, enum: undefined });

  const generator = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] });

  return generator.generate(contract, { info: { title: 'nixie', version: '0' } });
}
