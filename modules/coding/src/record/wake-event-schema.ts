import { z } from 'zod';

export const wakeEventSchema = z.enum([
  'waiting',
  'idle',
  'ended',
  'gone',
  'progress',
  'blocked',
  'decision',
]);
