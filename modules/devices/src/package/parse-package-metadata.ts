import { z } from 'zod';
import type { PackageMetadata } from './types';

const metadataSchema = z
  .object({
    name: z.string(),
    version: z.string(),
    description: z.string().optional(),
    _npmUser: z.object({ name: z.string() }).optional(),
    dist: z.object({
      integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]{86}==$/u),
      unpackedSize: z.int().nonnegative().optional(),
    }),
  })
  .transform((document) => {
    const { _npmUser: npmUser, ...rest } = document;

    return { ...rest, npmUser };
  });

const descriptionLimit = 500;

// What the registry's document for one version says, or null for a document that holds no sha512
// integrity or names another package or version than the one asked for.
export function parsePackageMetadata(
  text: string,
  name: string,
  version: string,
): PackageMetadata | null {
  let json: unknown = null;

  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }

  const parsed = metadataSchema.safeParse(json);

  if (!parsed.success || parsed.data.name !== name || parsed.data.version !== version) {
    return null;
  }

  return {
    name,
    version,
    integrity: parsed.data.dist.integrity,
    unpackedBytes: parsed.data.dist.unpackedSize ?? null,
    publisher: parsed.data.npmUser?.name ?? 'unknown',
    description: (parsed.data.description ?? '').slice(0, descriptionLimit),
  };
}
