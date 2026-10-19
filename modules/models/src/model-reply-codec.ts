import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { modelFieldsShape } from './model-fields-shape';

// A reply from the conversation's model: the SDK's message ID, and the turn's count of thinking
// tokens, absent when it did not think. Its text and reasoning summary are erasable; the count
// stays in the plain payload, so a projection reads it without a key and it outlives a forget.
export const modelReplyCodec = defineRecordCodec(
  'model.reply',
  z.object({
    ...modelFieldsShape,
    messageID: z.string(),
    thinkingTokens: z.int().nonnegative().exactOptional(),
  }),
);
