import { z } from 'zod';

export const sessionStateSchema = z.enum(['running', 'waiting', 'idle', 'ended', 'gone']);
