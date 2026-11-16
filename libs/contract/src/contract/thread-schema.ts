import { z } from 'zod';

export const threadSchema = z.string().min(1).max(200);
