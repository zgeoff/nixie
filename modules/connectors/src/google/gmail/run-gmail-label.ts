import { z } from 'zod';
import type { ActionAttempt, ProviderResponse } from '../../types';
import { buildItemID } from './build-item-id';
import { callGmail } from './call-gmail';
import { parseItemID } from './parse-item-id';
import { pickGmailErrorResponse } from './pick-gmail-error-response';
import { readCallContext } from './read-call-context';
import { isSystemLabel, readLabelIndex } from './read-label-index';
import type { GmailDeps } from './types';

export const labelArgumentsSchema = z.strictObject({
  threads: z.array(z.string()).min(1).max(50),
  add: z.array(z.string().min(1)).max(20),
  remove: z.array(z.string().min(1)).max(20),
  connection: z.string().exactOptional(),
});

// The attempt of gmail.label: makes each user label that `add` names and Gmail lacks, then changes
// the labels of each thread. A change that was already made is made again with no effect, so a retry
// is safe.
export async function runGmailLabel(
  deps: GmailDeps,
  attempt: ActionAttempt,
): Promise<ProviderResponse> {
  const context = await readCallContext(deps.access, attempt.arguments);

  const parsed = labelArgumentsSchema.safeParse(attempt.arguments);

  if (context === null) {
    return { kind: 'refused', reason: 'connection_forgotten' };
  }

  if (!parsed.success) {
    return { kind: 'refused', reason: 'the arguments of the label are unreadable' };
  }

  const index = await readLabelIndex(deps.hosts, context);

  if (index.kind === 'failed') {
    return index.status >= 500
      ? { kind: 'ambiguous', reason: index.reason }
      : { kind: 'refused_retryable', reason: index.reason };
  }

  const ids = new Map(index.idByName);

  const created: string[] = [];

  for (const name of parsed.data.add) {
    if (ids.has(name) || isSystemLabel(name)) {
      continue;
    }

    const made = await callGmail(deps.hosts, context, {
      path: '/labels',
      method: 'POST',
      json: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
    });

    if (made.kind === 'error') {
      return pickGmailErrorResponse(made);
    }

    const id =
      typeof made.body === 'object' && made.body !== null && 'id' in made.body
        ? made.body.id
        : null;

    if (typeof id !== 'string') {
      return { kind: 'ambiguous', reason: 'Gmail answered with no label' };
    }

    ids.set(name, id);
    created.push(name);
  }

  const addLabelIds = collectIDs(ids, parsed.data.add);
  const removeLabelIds = collectIDs(ids, parsed.data.remove);

  for (const thread of parsed.data.threads) {
    const item = parseItemID(thread);

    if (item === null) {
      return { kind: 'refused', reason: `BAD_ITEM_ID: ${thread}` };
    }

    const changed = await callGmail(deps.hosts, context, {
      path: `/threads/${encodeURIComponent(item.id)}/modify`,
      method: 'POST',
      json: { addLabelIds, removeLabelIds },
    });

    if (changed.kind === 'error') {
      return pickGmailErrorResponse(changed);
    }
  }

  return {
    kind: 'success',
    result: {
      threads: parsed.data.threads.map((thread) =>
        buildItemID(context.connection, parseItemID(thread)?.id ?? thread),
      ),
      created,
    },
  };
}

// A name that is no label of the account has nothing to remove, so it drops out.
function collectIDs(ids: ReadonlyMap<string, string>, names: readonly string[]): string[] {
  return names.flatMap((name) => {
    const id = ids.get(name);

    return id === undefined ? [] : [id];
  });
}
