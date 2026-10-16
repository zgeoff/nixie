import { z } from 'zod';

// A sealed value that holds one free text: a comment, a note or a summary.
export const sealedTextSchema = z.strictObject({ text: z.string() });
