import { z } from 'zod';
import { defineRecordCodec } from '../utils/define-record-codec';

// A step of the task was refused by the provider's limit, or found its provider stopped, so the task
// waits until the provider's stop clears. The record goes on no thread.
export const spendProviderHeldCodec = defineRecordCodec(
  'spend.provider_held',
  z.object({ taskID: z.string(), provider: z.string() }),
);
