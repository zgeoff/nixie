import type { Log } from '@heynixie/log';
import { readRecordAttachments } from '@heynixie/log';
import type { BodyFields, BodyFieldsRequest } from '@heynixie/policy';
import { z } from 'zod';

export const retopicToolName = 'memory.retopic';
const itemSchema = z.object({ id: z.string(), gist: z.string() });
const planSchema = z.object({ sentence: z.string(), items: z.array(itemSchema) });

// The card of a re-file says the move, such as `self/lines → self/diary, 20 items`, and lists the
// gist of each item under it. The call stored both with its own record when it asked, so a forget
// of that record takes them, and the card then has no body.
export async function readRetopicBodyFields(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  request: BodyFieldsRequest,
): Promise<BodyFields> {
  if (request.tool !== retopicToolName) {
    return { status: 'none' };
  }

  const found = await readRecordAttachments(log, [request.callSequence]);

  const attached = found.get(request.callSequence);
  const bytes = attached?.status === 'readable' ? attached.attachments[0] : undefined;

  if (bytes === undefined) {
    return { status: 'unreadable' };
  }

  const text = new TextDecoder().decode(bytes);

  const plan = planSchema.safeParse(JSON.parse(text));

  if (!plan.success) {
    return { status: 'unreadable' };
  }

  return {
    status: 'fields',
    sentence: plan.data.sentence,
    fields: { items: plan.data.items.map((item) => `[${item.id}] ${item.gist}`).join('\n') },
  };
}
