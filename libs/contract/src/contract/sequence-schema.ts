import { z } from 'zod';

export const sequenceSchema = z.int().nonnegative();
