import { z } from 'zod';

export const sealedTextSchema = z.strictObject({ text: z.string() });
