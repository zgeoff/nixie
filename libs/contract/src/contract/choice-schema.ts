import { z } from 'zod';

export const choiceSchema = z.enum(['approve', 'always_allow', 'defer', 'decline']);
