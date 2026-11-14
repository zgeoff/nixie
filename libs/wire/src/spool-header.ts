import { z } from 'zod';
import { captureIDPattern } from './capture-tag';
import { uncompressedP256PointBytes } from './is-p256-point';
import { modelAPIs } from './model-api';
import { parseBase64URL } from './parse-base64url';

export const spoolIVBytes = 12;

export const spoolHeaderSchema = z.strictObject({
  version: z.literal(1),
  captureID: z.string().regex(captureIDPattern),
  writer: z.string().regex(/^[0-9a-f]+$/u),
  counter: z.int().min(1),
  receivedAt: z.int().min(0),
  route: z.string().min(1),
  api: z.enum(modelAPIs),
  endpoint: z.enum(['messages', 'responses']),
  bytes: z.int().min(0),
  ephemeralKey: z
    .string()
    .refine((text) => parseBase64URL(text)?.length === uncompressedP256PointBytes),
  iv: z.string().refine((text) => parseBase64URL(text)?.length === spoolIVBytes),
});

export type SpoolHeader = z.infer<typeof spoolHeaderSchema>;
