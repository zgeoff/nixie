import { fileSendInputSchema, fileSendResultSchema } from '@heynixie/contract';
import { z } from 'zod';
import type { SentFileActivity, ToolActivity } from './build-activity';

const contentSchema = z.object({ result: fileSendResultSchema });

// A send that has no readable result, such as a refused one or one whose record a forget removed,
// shows nothing.
export function collectSentFiles(calls: readonly ToolActivity[]): readonly SentFileActivity[] {
  return calls.flatMap((call) => {
    const sent = call.tool === 'file.send' ? contentSchema.safeParse(call.content).data : undefined;

    if (sent === undefined) {
      return [];
    }

    const caption = fileSendInputSchema.safeParse(call.input).data?.caption;

    return [
      {
        callID: call.callID,
        file: sent.result.file,
        name: sent.result.name,
        bytes: sent.result.bytes,
        mediaType: sent.result.mediaType,
        ...(caption === undefined ? {} : { caption }),
      },
    ];
  });
}
