import { z } from 'zod';

export const measuresSchema = z.strictObject({ dollars: z.number(), tokens: z.number() });
