import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { ConnectionRecordKind } from './connection-record-kind';

const kind = 'connection.break_lasted' satisfies ConnectionRecordKind;

// A break passed the time that nixie tells the model about it. `sinceMs` is when the break began,
// which names the break, so one break gets one record.
export const breakLastedCodec = defineRecordCodec(
  kind,
  z.object({ connection: z.string(), sinceMs: z.number() }),
);
