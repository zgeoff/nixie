import { taskMessageInputSchema, taskMessageResultSchema } from '@heynixie/contract';
import { z } from 'zod';
import type { TaskMessageActivity, ToolActivity } from './build-activity';

// The message record lands in the receiver's thread, so the sender's thread holds only its call of
// the message tool: the receiver and the text in the input, and the message ID in the result.
const contentSchema = z.object({ result: taskMessageResultSchema });

export function collectSentMessages(
  calls: readonly ToolActivity[],
): readonly TaskMessageActivity[] {
  return calls.flatMap((call) => {
    const input =
      call.tool === 'task.message' ? taskMessageInputSchema.safeParse(call.input).data : undefined;

    const sent = contentSchema.safeParse(call.content).data?.result;

    if (input === undefined || sent === undefined) {
      return [];
    }

    return [
      {
        direction: 'sent',
        hop: sent.hop,
        kind: input.kind,
        messageID: sent.messageID,
        taskID: input.to,
        text: input.body,
        woke: sent.woke,
      },
    ];
  });
}
