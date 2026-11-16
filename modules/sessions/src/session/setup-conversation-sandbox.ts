import type { Logger } from '@heynixie/logger';
import type { Harness } from '@heynixie/models';
import type {
  GuestCommand,
  Sandbox,
  SandboxAdapter,
  SandboxLimits,
  SecretSpec,
} from '@heynixie/sandbox';
import { buildSandboxSpec, findKeptSandbox, removeSandboxes } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import { writeReplacedSession } from './write-replaced-session';

export interface ConversationSandboxSpec {
  readonly context: TasksContext;
  readonly sandboxes: SandboxAdapter;
  readonly image: string;
  readonly limits: SandboxLimits;
  readonly command: GuestCommand;
  readonly harness: Harness;

  readonly log: Logger;
}

export async function setupConversationSandbox(
  options: ConversationSandboxSpec,
  secret: SecretSpec,
): Promise<Sandbox> {
  const spec = buildSandboxSpec({
    kind: 'conversation',
    image: options.image,
    owner: conversationTaskID,
    limits: options.limits,
    modelGrant: options.harness.buildGrant(secret),
  });

  const existing = await options.sandboxes.list(conversationTaskID);

  const kept = findKeptSandbox(existing, spec);
  const replaced = existing.filter((sandbox) => sandbox !== kept);

  const target = await (kept ?? options.sandboxes.create(spec));

  // A kept sandbox holds the newest session. A replaced one that survived an earlier failed destroy
  // is older, so copying from it would overwrite the kept transcript.
  if (kept === undefined) {
    await writeReplacedSession({
      ...options,
      listSessionFiles: options.harness.session?.listFiles ?? null,
      replaced,
      target,
    });
  }

  await removeSandboxes(replaced, options.log);

  return target;
}
