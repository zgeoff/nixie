import { z } from 'zod';

export const captureAnswerSchema = z.strictObject({ canCapture: z.boolean() });

export type CaptureAnswer = z.infer<typeof captureAnswerSchema>;
