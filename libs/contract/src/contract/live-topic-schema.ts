import { z } from 'zod';

// Each topic is the root of the web client's query keys that it covers, one to one.
export const liveTopicSchema = z.enum([
  'approvals',
  'backups',
  'calls',
  'computer',
  'connections',
  'definitions',
  'images',
  'mcp',
  'memory',
  'nixie',
  'notebook',
  'spend',
  'tasks',
  'triggers',
]);

export type LiveTopic = z.output<typeof liveTopicSchema>;
