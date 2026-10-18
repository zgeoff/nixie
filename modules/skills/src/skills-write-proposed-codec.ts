import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const proposedFileSchema = z.object({ path: z.string(), text: z.string() });

// the first destination-like token in the files that you never typed and your definitions lack
const untypedTokenSchema = z.object({ kind: z.string(), raw: z.string() });

// the run and the tool call that proposed the skill
const provenanceSchema = z.object({ runID: z.string(), callID: z.string(), profile: z.string() });

// A skill that nixie proposes to write, for your review: its files, the version it would replace,
// and the outcome of the token check. The proposal ID is the short ID the model reads.
export const skillsWriteProposedCodec = defineRecordCodec(
  'skills.write_proposed',
  z.object({
    proposalID: z.string(),
    name: z.string(),
    skillHash: z.string(),

    // the version in force that the skill would replace, or null for a new skill
    baseHash: z.string().nullable(),
    files: proposedFileSchema.array(),

    // null when the token check passed
    untypedToken: untypedTokenSchema.nullable(),
    provenance: provenanceSchema,
  }),
);
