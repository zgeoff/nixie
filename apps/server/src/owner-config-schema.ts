import { z } from 'zod';

// The owner section of the deployment configuration: the owner's name, which the conversation
// reads in place of "the owner", or null when the file sets none. The name may be a
// deployment:<name> reference to the secrets file, which resolveOwnerConfig follows at start.
export const ownerConfigSchema = z
  .strictObject({ name: z.string().min(1).optional() })
  .transform((config): OwnerConfig => ({ name: config.name ?? null }));

export interface OwnerConfig {
  readonly name: string | null;
}
