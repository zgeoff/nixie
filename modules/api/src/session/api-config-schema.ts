import { z } from 'zod';

export interface APIConfig {
  readonly readOnlyTokenHashes: readonly string[];
}

// Each hash is the SHA-256, in lowercase hex, of a token of at least 256 random bits, so the hash
// can sit in a deployment repo that is public.
export const apiConfigSchema = z
  .strictObject({
    read_only_token_hashes: z.array(z.string().regex(/^[0-9a-f]{64}$/u)).default([]),
  })
  .transform((config): APIConfig => ({ readOnlyTokenHashes: config.read_only_token_hashes }));
