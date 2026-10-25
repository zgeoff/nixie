import { z } from 'zod';
import type { TaskMessageKind } from './types';

export const taskMessageKindSchema = z.enum([
  'progress',
  'question',
  'request',
  'report',
  'reply',
  'chat',
]) satisfies z.ZodType<TaskMessageKind>;
