import { z } from 'zod';

const transportSchema = z.string().max(40);

export const transportsSchema = z.array(transportSchema).max(10);
