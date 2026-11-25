import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const markedReadSchema = z.object({ shortID: z.string() });

// A stored mail that the assistant read.
export const mailMarkedReadCodec = defineRecordCodec('mail.marked_read', markedReadSchema);
