import { z } from 'zod';

export const passkeyFailureSchema = z.enum([
  'unknown_challenge',
  'binding',
  'unknown_passkey',
  'origin',
  'no_user_verification',
  'signature',
  'counter',
]);
