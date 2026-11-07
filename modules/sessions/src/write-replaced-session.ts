import type { Logger } from '@heynixie/logger';
import type { HarnessDescriptor } from '@heynixie/models';
import type { GuestCommand, Sandbox } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import { conversationTaskID, readSessionBoundary } from '@heynixie/tasks';
import { parseSessionBoundary } from './parse-session-boundary';
import { writeKeptSession } from './write-kept-session';

export interface ReplacedSessionSpec {
  readonly context: TasksContext;
  readonly command: GuestCommand;
  readonly listSessionFiles: HarnessDescriptor['listSessionFiles'];
  readonly log: Logger;

  readonly replaced: readonly Sandbox[];
  readonly target: Sandbox;
}

export async function writeReplacedSession(spec: ReplacedSessionSpec): Promise<void> {
  const listSessionFiles = spec.listSessionFiles;

  if (spec.replaced.length === 0 || listSessionFiles === null) {
    return;
  }

  const failures: string[] = [];

  for (const from of spec.replaced) {
    const failure = await tryWriteKeptSession({ ...spec, listSessionFiles }, from);

    if (failure === null) {
      return;
    }

    failures.push(failure);
  }

  spec.log('conversation.session_copy_failed', {
    toSandboxID: spec.target.id,
    reason: failures.join('; '),
  });
}

interface KeptSessionSource extends ReplacedSessionSpec {
  readonly listSessionFiles: NonNullable<ReplacedSessionSpec['listSessionFiles']>;
}

async function tryWriteKeptSession(spec: KeptSessionSource, from: Sandbox): Promise<string | null> {
  try {
    const boundary = await readSessionBoundary(spec.context, conversationTaskID);

    const resume = parseSessionBoundary(boundary);

    if (resume !== null) {
      await writeKeptSession({
        from,
        to: spec.target,
        command: spec.command,
        files: spec.listSessionFiles(resume),
      });
    }

    return null;
  } catch (error) {
    return `${from.id}: ${error instanceof Error ? error.message : String(error)}`;
  }
}
