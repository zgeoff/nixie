import { z } from 'zod';

export const userVerificationSchema = z.enum(['required', 'preferred', 'discouraged']);
