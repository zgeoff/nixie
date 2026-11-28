import type { JSONObject } from '@heynixie/log';
import { JSON_OBJECT_SCHEMA } from '@heynixie/log';
import { z } from 'zod';
import type { TaskRunOptions } from '../types';
import { taskRunOptionsSchema } from './task-run-options-schema';

type EncodableTaskRunOptions = Omit<TaskRunOptions, 'log'> & Partial<Pick<TaskRunOptions, 'log'>>;

const encoder: z.ZodType = taskRunOptionsSchema;

// The options as the log stores them: a limit that a task run lacks takes the number that records
// hold in its place, and a task run that names no log keeps its own, which encoding leaves unset.
export function encodeTaskRunOptions(options: EncodableTaskRunOptions): JSONObject {
  return JSON_OBJECT_SCHEMA.parse(z.encode(encoder, { log: 'own', ...options }));
}
