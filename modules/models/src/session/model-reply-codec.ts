import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { modelFieldsShape } from './model-fields-shape';

export const modelReplyCodec = defineRecordCodec(
  'model.reply',
  z.object({
    ...modelFieldsShape,
    messageID: z.string(),
    thinkingTokens: z.int().nonnegative().exactOptional(),
  }),
);
