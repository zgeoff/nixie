import { z } from 'zod';
import { manifestSchema } from './manifest-schema';

export function buildManifestJSONSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(manifestSchema, { io: 'input', target: 'draft-2020-12' });

  return {
    ...schema,
    title: 'nixie definitions manifest',
    description:
      "The nixie.yaml at the root of the definitions, which holds their format and the conversation's skill list",
  };
}
