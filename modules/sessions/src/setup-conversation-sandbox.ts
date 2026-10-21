import type { Logger } from '@heynixie/logger';
import { buildModelGrant } from '@heynixie/models';
import type {
  GuestCommand,
  Sandbox,
  SandboxAdapter,
  SandboxLimits,
  SecretSpec,
} from '@heynixie/sandbox';
import { buildSandboxSpec, findKeptSandbox } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import { conversationTaskID } from '@heynixie/tasks';
import { writeReplacedSession } from './write-replaced-session';

export interface ConversationSandboxSpec {
  readonly context: TasksContext;
  readonly sandboxes: SandboxAdapter;
  readonly image: string;
  readonly limits: SandboxLimits;
  readonly command: GuestCommand;

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
    modelGrant: buildModelGrant(secret),
  });

  const existing = await options.sandboxes.list(conversationTaskID);

  const kept = findKeptSandbox(existing, spec);
  const replaced = existing.filter((sandbox) => sandbox !== kept);

  const target = await (kept ?? options.sandboxes.create(spec));

  await writeReplacedSession({ ...options, replaced, target });

  await Promise.all(replaced.map((old) => old.destroy()));

  return target;
}
