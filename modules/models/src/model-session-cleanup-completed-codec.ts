import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { sessionCleanupCauseShape } from './session-cleanup-cause-shape';

// The end of a session's cleanup after a forget, with the forget that caused it.
export const modelSessionCleanupCompletedCodec = defineRecordCodec(
  'model.session_cleanup_completed',
  z.object(sessionCleanupCauseShape),
);
