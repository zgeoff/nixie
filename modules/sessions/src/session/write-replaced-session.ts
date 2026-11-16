import type { Logger } from '@heynixie/logger';
import type { GuestCommand, Sandbox } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import { conversationTaskID, readSessionBoundary } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import { parseSessionBoundary } from '../utils/parse-session-boundary';
import { holdsTranscript, writeKeptSession } from './write-kept-session';

export interface ReplacedSessionSpec {
  readonly context: TasksContext;
  readonly command: GuestCommand;

  // the paths that a replaced sandbox carries, or null for a harness that keeps no session
  readonly listSessionFiles: ((point: SessionPoint) => readonly string[]) | null;
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
      const files = spec.listSessionFiles(resume);

      // A kept target that holds the transcript is newer than a replaced sandbox that survived a
      // failed destroy, so a copy would overwrite its later turns.
      if (!(await holdsTarget(spec, files))) {
        await writeKeptSession({ from, to: spec.target, command: spec.command, files });
      }
    }

    return null;
  } catch (error) {
    return `${from.id}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function holdsTarget(spec: ReplacedSessionSpec, files: readonly string[]): Promise<boolean> {
  const [transcript] = files;

  if (transcript === undefined) {
    return Promise.resolve(false);
  }

  return holdsTranscript(spec.target, spec.command, transcript);
}
