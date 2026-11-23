import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// `device` is the session that holds the desktop
export const takeoverStartedCodec = defineRecordCodec(
  'computer.takeover_started',
  z.object({ shortID: z.string(), device: z.string() }),
);
