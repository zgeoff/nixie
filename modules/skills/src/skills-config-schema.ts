import { z } from 'zod';

export interface SkillsConfig {
  readonly catalogShare: number;
}

export const skillsConfigSchema = z
  .strictObject({ catalog_share: z.number().positive().max(0.5).default(0.02) })
  .transform((config): SkillsConfig => ({ catalogShare: config.catalog_share }));
