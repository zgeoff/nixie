import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { TurnInputsRecordKind } from './turn-inputs-record-kind';

export const inputOpenedCodec = defineRecordCodec(
  'model.input_opened' satisfies TurnInputsRecordKind,
  z.object({ inputID: z.string().min(1), by: z.literal('host') }),
);
