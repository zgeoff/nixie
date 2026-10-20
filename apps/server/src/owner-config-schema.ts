import type { OwnerPronouns } from '@heynixie/memory';
import { defaultOwnerPronouns } from '@heynixie/memory';
import { z } from 'zod';

export interface OwnerConfig {
  readonly name: string | null;
  readonly pronouns: OwnerPronouns;
}

// The owner section of the deployment configuration: the owner's name or null, and pronouns that
// default to they and their. The name and each pronoun may be a deployment:<name> reference to the
// secrets file, which resolveOwnerConfig follows at start.
export const ownerConfigSchema = z
  .strictObject({
    name: z.string().min(1).optional(),
    pronouns: z
      .strictObject({ they: z.string().min(1), their: z.string().min(1) })
      .default(defaultOwnerPronouns),
  })
  .transform((config): OwnerConfig => ({ name: config.name ?? null, pronouns: config.pronouns }));
