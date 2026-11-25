import { z } from 'zod';
import { defineRecordCodec } from '../utils/define-record-codec';

// The task waited from `sinceMs` to `untilMs` for a spending limit. It holds no route and no dollar
// figure, because the model never reads either.
export const spendWaitNoticeCodec = defineRecordCodec(
  'spend.wait_notice',
  z.object({ taskID: z.string(), sinceMs: z.number(), untilMs: z.number() }),
);
