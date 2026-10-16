import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { sessionCleanupCauseShape } from './session-cleanup-cause-shape';

// A session that a forget invalidated, with the forget that caused it.
export const modelSessionInvalidatedCodec = defineRecordCodec(
  'model.session_invalidated',
  z.object(sessionCleanupCauseShape),
);
