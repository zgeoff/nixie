import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// Asks the call's thread for its last turn, which writes the call's summary. It lands on the call's
// own thread when the call ends.
export const callClosingCodec = defineRecordCodec('call.closing', z.object({ callID: z.string() }));
