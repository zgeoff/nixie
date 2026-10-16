import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { modelFieldsShape } from './model-fields-shape';

// each status line the opening showed, by name
const statusSchema = z.record(z.string(), z.union([z.string(), z.number()]));

// A new session's opening: what started it, the session a rebuild replaced, what the opening read
// and the sequence its recent turns start from, the newest recall before it, the status lines it
// showed, and the persona and policy hashes it opened under.
export const modelSessionOpenedCodec = defineRecordCodec(
  'model.session_opened',
  z.object({
    ...modelFieldsShape,
    kind: z.enum(['first', 'compaction', 'rebuild']),
    reason: z.enum(['lost', 'forget', 'persona', 'images']).nullable(),
    lostSessionID: z.string().nullable(),
    summarySequence: z.int().nullable(),
    recentRecords: z.int(),
    heldFrom: z.int().nonnegative().exactOptional(),
    recentEvents: z.int(),
    recalledThrough: z.int().nonnegative(),
    status: statusSchema,
    personaHash: z.string(),
    policyHash: z.string(),
  }),
);
