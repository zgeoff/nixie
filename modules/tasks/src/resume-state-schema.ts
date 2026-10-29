import { z } from 'zod';
import type { ResumeState } from './types';

export const resumeStateSchema = z.enum(['ready', 'waiting']) satisfies z.ZodType<ResumeState>;
