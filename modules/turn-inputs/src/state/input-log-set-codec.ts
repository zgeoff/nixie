import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { TurnInputsRecordKind } from './turn-inputs-record-kind';

// The payload holds the log's state and when it ends, and no request text.
export const inputLogSetCodec = defineRecordCodec(
  'model.input_log_set' satisfies TurnInputsRecordKind,
  z.object({ state: z.enum(['on', 'off']), until: z.int().nonnegative().nullable() }),
);
