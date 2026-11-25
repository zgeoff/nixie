import { z } from 'zod';
import type { ActionAttempt, CheckResponse } from '../../types';
import { buildItemID } from './build-item-id';
import { callGmail } from './call-gmail';
import { parseItemID } from './parse-item-id';
import { readCallContext } from './read-call-context';
import { readLabelIndex } from './read-label-index';
import { labelArgumentsSchema } from './run-gmail-label';
import type { GmailDeps } from './types';

const labelIDsSchema = z.array(z.string()).exactOptional();
const threadMessageSchema = z.object({ labelIds: labelIDsSchema });
const threadSchema = z.object({ messages: z.array(threadMessageSchema).exactOptional() });

// The read-only check of a label change: found when each thread holds every label of `add` and none
// of `remove`. Anything else is inconclusive, because a later change can have replaced the labels.
// The check cannot tell which labels the action made, so a found change answers `created: null`.
export async function checkGmailLabels(
  deps: GmailDeps,
  attempt: ActionAttempt,
): Promise<CheckResponse> {
  const context = await readCallContext(deps.access, attempt.arguments);

  const parsed = labelArgumentsSchema.safeParse(attempt.arguments);

  if (context === null || !parsed.success) {
    return { kind: 'inconclusive' };
  }

  const index = await readLabelIndex(deps.hosts, context);

  if (index.kind === 'failed') {
    return { kind: 'inconclusive' };
  }

  const add = parsed.data.add.map((name) => index.idByName.get(name));
  const remove = parsed.data.remove.flatMap((name) => index.idByName.get(name) ?? []);

  if (add.some((id) => id === undefined)) {
    return { kind: 'inconclusive' };
  }

  for (const thread of parsed.data.threads) {
    const item = parseItemID(thread);

    const read =
      item === null
        ? null
        : await callGmail(deps.hosts, context, {
            path: `/threads/${encodeURIComponent(item.id)}`,
            query: { format: 'minimal' },
          });

    const held = read?.kind === 'ok' ? threadSchema.safeParse(read.body) : null;

    if (held === null || !held.success) {
      return { kind: 'inconclusive' };
    }

    const labels = new Set((held.data.messages ?? []).flatMap((message) => message.labelIds ?? []));

    if (
      !add.every((id) => id !== undefined && labels.has(id)) ||
      remove.some((id) => labels.has(id))
    ) {
      return { kind: 'inconclusive' };
    }
  }

  return {
    kind: 'found',
    result: {
      threads: parsed.data.threads.map((thread) =>
        buildItemID(context.connection, parseItemID(thread)?.id ?? thread),
      ),
      created: null,
    },
  };
}
