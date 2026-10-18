import { z } from 'zod';

// The skills section of the deployment configuration: the share of the model's context window the
// skill catalog in the system prompt may fill, 2% by default. Past it, the catalog lists the
// remaining skills by name alone.
export const skillsConfigSchema = z
  .strictObject({ catalog_share: z.number().positive().max(0.5).default(0.02) })
  .transform((config): SkillsConfig => ({ catalogShare: config.catalog_share }));

export interface SkillsConfig {
  readonly catalogShare: number;
}
