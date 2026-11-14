import { z } from 'zod';
import { defineRecordCodec } from '../utils/define-record-codec';

export const nixieResumedCodec = defineRecordCodec('nixie.resumed', z.object({ by: z.string() }));
