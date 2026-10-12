import type { Logger } from '@heynixie/ops';
import type { Sandbox } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import { conversationTaskID, readSessionBoundary } from '@heynixie/tasks';
import { parseSessionBoundary } from './parse-session-boundary';
import type { GuestCommand } from './run-guest-turn';
import { writeKeptSession } from './write-kept-session';

export interface ReplacedSessionSpec {
  readonly context: TasksContext;
  readonly command: GuestCommand;
  readonly log: Logger;

  // the conversation's sandboxes that the target replaces, any of which may hold the session
  readonly replaced: readonly Sandbox[];
  readonly target: Sandbox;
}

// Writes the session the conversation resumes into the sandbox that replaces the old ones, from the
// first old sandbox that holds it. When every copy fails, it logs a warning and lets the start go
// on: the next turn finds the session missing and starts a fresh one, so a deploy never fails here.
export async function writeReplacedSession(spec: ReplacedSessionSpec): Promise<void> {
  if (spec.replaced.length === 0) {
    return;
  }
  const failures: string[] = [];

  for (const from of spec.replaced) {
    // oxlint-disable-next-line no-await-in-loop -- one copy at a time, and the first that lands ends the search
    const failure = await tryWriteKeptSession(spec, from);

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

// the copy from one old sandbox, with its failure as a message naming that sandbox
async function tryWriteKeptSession(
  spec: ReplacedSessionSpec,
  from: Sandbox,
): Promise<string | null> {
  try {
    // the first start makes the sandbox before the conversation's task, so the read sits in the try
    const boundary = await readSessionBoundary(spec.context, conversationTaskID);
    const resume = parseSessionBoundary(boundary);

    if (resume !== null) {
      await writeKeptSession({
        from,
        to: spec.target,
        command: spec.command,
        sessionID: resume.sessionID,
      });
    }
    return null;
  } catch (error) {
    return `${from.id}: ${error instanceof Error ? error.message : String(error)}`;
  }
}
