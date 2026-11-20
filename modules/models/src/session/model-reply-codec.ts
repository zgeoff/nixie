import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { modelFieldsShape } from './model-fields-shape';

export const modelReplyCodec = defineRecordCodec(
  'model.reply',
  z.object({
    ...modelFieldsShape,
    messageID: z.string(),

    // the step run that wrote the reply live, which a void names; older replies carry none
    runID: z.string().exactOptional(),

    // an older reply carries the turn's thinking tokens, and a newer turn end carries them
    thinkingTokens: z.int().nonnegative().exactOptional(),
  }),
);
