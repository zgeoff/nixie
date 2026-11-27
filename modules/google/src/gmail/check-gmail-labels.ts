import type { ActionAttempt, CheckResponse } from '@heynixie/connections';
import { z } from 'zod';
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

// The read-only check of a label change: found when every message of each thread holds every label
// of `add` and none of `remove`, as a thread-wide change leaves it. Anything else is inconclusive, because a later change can have replaced the labels.
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

    const messages = held.data.messages ?? [];

    if (
      messages.length === 0 ||
      !messages.every((message) => isChanged(message, { add, remove }))
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

interface LabelChange {
  readonly add: readonly (string | undefined)[];
  readonly remove: readonly string[];
}

function isChanged(message: z.output<typeof threadMessageSchema>, change: LabelChange): boolean {
  const labels = new Set(message.labelIds);

  return (
    change.add.every((id) => id !== undefined && labels.has(id)) &&
    !change.remove.some((id) => labels.has(id))
  );
}
