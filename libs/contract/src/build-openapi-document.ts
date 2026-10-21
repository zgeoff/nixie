import type { OpenAPI } from '@orpc/openapi';
import { OpenAPIGenerator } from '@orpc/openapi';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { contract } from './contract';

export function buildOpenAPIDocument(): Promise<OpenAPI.Document> {
  const generator = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] });

  return generator.generate(contract, { info: { title: 'nixie', version: '0' } });
}
