import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A finished conversation task that a start makes ready again.
export const taskRevivedCodec = defineRecordCodec('task.revived', z.object({ taskID: z.string() }));
