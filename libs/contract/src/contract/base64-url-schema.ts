import { z } from 'zod';

export const base64URLSchema = z.string().min(1).max(20_000);
