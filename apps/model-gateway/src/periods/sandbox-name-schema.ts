import { z } from 'zod';

export const sandboxNameSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
