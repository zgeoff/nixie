import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const recoveryNoticeCodec = defineRecordCodec(
  'recovery.notice',
  z.object({ recoveryID: z.string(), restoredAt: z.number(), backupTakenAt: z.number() }),
);
