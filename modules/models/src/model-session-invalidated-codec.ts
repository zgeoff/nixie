import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { sessionCleanupCauseShape } from './session-cleanup-cause-shape';

export const modelSessionInvalidatedCodec = defineRecordCodec(
  'model.session_invalidated',
  z.object(sessionCleanupCauseShape),
);
