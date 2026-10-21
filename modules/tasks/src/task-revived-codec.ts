import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const taskRevivedCodec = defineRecordCodec('task.revived', z.object({ taskID: z.string() }));
