import { z } from 'zod';
import type { PauseCause } from './types';

export const pauseCauseSchema = z.enum([
  'restore',
  'owner',
  'spending',
]) satisfies z.ZodType<PauseCause>;
