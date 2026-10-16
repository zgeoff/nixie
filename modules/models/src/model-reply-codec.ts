import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { modelFieldsShape } from './model-fields-shape';

// A reply from the conversation's model: the SDK's ID for the message. Its text is erasable.
export const modelReplyCodec = defineRecordCodec(
  'model.reply',
  z.object({ ...modelFieldsShape, messageID: z.string() }),
);
