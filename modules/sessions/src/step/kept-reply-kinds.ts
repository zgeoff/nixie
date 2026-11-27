import {
  modelReplyCodec,
  modelReplyVoidedCodec,
  modelSessionInvalidatedCodec,
} from '@heynixie/models';

export const keptReplyKinds = [
  modelReplyCodec.kind,
  modelReplyVoidedCodec.kind,
  modelSessionInvalidatedCodec.kind,
  'task.step_committed',
] as const;
