import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A credential granted to a sandbox for one host, named by its secret and never holding its value.
export const sandboxGrantedCodec = defineRecordCodec(
  'sandbox.granted',
  z.object({ sandboxID: z.string(), secret: z.string(), host: z.string() }),
);
