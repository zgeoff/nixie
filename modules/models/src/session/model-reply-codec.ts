import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { modelFieldsShape } from './model-fields-shape';

const sequencesSchema = z.array(z.int().nonnegative());

export const modelReplyCodec = defineRecordCodec(
  'model.reply',
  z.object({
    ...modelFieldsShape,
    messageID: z.string(),

    // the step run that wrote the reply live, which a void names; older replies carry none
    runID: z.string().exactOptional(),

    // the inbox sequences the turn had read when it wrote the reply, which a rerun of an aborted
    // turn takes as answered; a reply that follows no read carries none
    readSequences: sequencesSchema.exactOptional(),

    // an older reply carries the turn's thinking tokens, and a newer turn end carries them
    thinkingTokens: z.int().nonnegative().exactOptional(),
  }),
);
