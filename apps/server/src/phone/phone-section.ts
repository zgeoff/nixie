import type { z } from 'zod';
import type { phoneSectionSchema } from './phone-section-schema';

export type PhoneSection = z.output<typeof phoneSectionSchema>;
