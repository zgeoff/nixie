import { z } from 'zod';

export const JSON_OBJECT_SCHEMA = z.record(z.string(), z.json());
