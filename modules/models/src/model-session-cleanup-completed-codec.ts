import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { sessionCleanupCauseShape } from './session-cleanup-cause-shape';

export const modelSessionCleanupCompletedCodec = defineRecordCodec(
  'model.session_cleanup_completed',
  z.object(sessionCleanupCauseShape),
);
