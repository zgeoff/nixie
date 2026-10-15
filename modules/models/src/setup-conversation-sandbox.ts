import type { Logger } from '@heynixie/ops';
import type { Sandbox, SandboxAdapter, SandboxLimits, SecretSpec } from '@heynixie/sandbox';
import { buildSandboxSpec, findKeptSandbox } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import { buildModelGrant } from './build-model-grant';
import type { GuestCommand } from './run-guest-turn';
import { writeReplacedSession } from './write-replaced-session';

export interface ConversationSandboxSpec {
  readonly context: TasksContext;
  readonly sandboxes: SandboxAdapter;
  readonly image: string;
  readonly limits: SandboxLimits;
  readonly command: GuestCommand;

  // the server's log, which takes a warning when a replaced sandbox's session does not carry over
  readonly log: Logger;
}

// Keeps the conversation's sandbox while it stays kept, and otherwise starts a replacement before the
// old sandbox goes and copies in the session the conversation resumes, so a changed spec or a
// retired sandbox keeps the session. The sandbox outlives each step of the conversation.
export async function setupConversationSandbox(
  options: ConversationSandboxSpec,
  secret: SecretSpec,
): Promise<Sandbox> {
  const spec = buildSandboxSpec({
    kind: 'conversation',
    image: options.image,
    owner: conversationTaskID,
    limits: options.limits,
    modelGrant: buildModelGrant(secret),
  });

  const existing = await options.sandboxes.list(conversationTaskID);

  const kept = findKeptSandbox(existing, spec);
  const replaced = existing.filter((sandbox) => sandbox !== kept);

  const target = await (kept ?? options.sandboxes.create(spec));

  // a start that stopped before the old sandbox went left both, so the copy runs again on a kept
  // one; no turn runs while an old sandbox remains, so the old copy is never behind the kept one
  await writeReplacedSession({ ...options, replaced, target });

  await Promise.all(replaced.map((old) => old.destroy()));

  return target;
}
