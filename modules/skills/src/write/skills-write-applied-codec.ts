import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const ruleSchema = z.object({ id: z.string(), revision: z.number() });
const provenanceSchema = z.object({ runID: z.string(), callID: z.string(), profile: z.string() });

export const skillsWriteAppliedCodec = defineRecordCodec(
  'skills.write_applied',
  z.object({
    writeID: z.string(),
    approvalID: z.string(),
    name: z.string(),
    skillHash: z.string(),
    baseHash: z.string().nullable(),
    rule: ruleSchema,
    provenance: provenanceSchema,
  }),
);
