import { z } from 'zod';

export const taskMessageKindSchema = z.enum([
  'progress',
  'question',
  'request',
  'report',
  'reply',
  'chat',
]);
