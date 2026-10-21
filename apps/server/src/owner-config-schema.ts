import type { OwnerPronouns } from '@heynixie/memory';
import { defaultOwnerPronouns } from '@heynixie/memory';
import { z } from 'zod';

export interface OwnerConfig {
  readonly name: string | null;
  readonly pronouns: OwnerPronouns;
}

export const ownerConfigSchema = z
  .strictObject({
    name: z.string().min(1).optional(),
    pronouns: z
      .strictObject({ they: z.string().min(1), their: z.string().min(1) })
      .default(defaultOwnerPronouns),
  })
  .transform((config): OwnerConfig => ({ name: config.name ?? null, pronouns: config.pronouns }));
