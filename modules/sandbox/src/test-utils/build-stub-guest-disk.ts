import { join } from 'node:path';
import { z } from 'zod';
import type { GuestHome } from '../types';

// One chain entry of a session: the uuid the SDK stamps on it, who wrote it, its text, and a rough
// count of the tokens it adds to the context.
const sessionEntrySchema = z
  .object({
    uuid: z.uuid(),
    role: z.enum(['user', 'assistant']),
    text: z.string(),
    tokens: z.int().nonnegative(),
  })
  .readonly();

export type StubSessionEntry = z.infer<typeof sessionEntrySchema>;

export interface StubGuestDisk {
  // every file of the sandbox by its absolute path in the guest
  readonly files: Map<string, Uint8Array<ArrayBuffer>>;

  // the session's entries from its transcript under the home, or null when the home holds none
  readonly readSession: (home: GuestHome, sessionID: string) => readonly StubSessionEntry[] | null;

  // writes the transcript of a session, one JSON line per entry, as the CLI does
  readonly writeSession: (
    home: GuestHome,
    sessionID: string,
    entries: readonly StubSessionEntry[],
  ) => void;

  // removes every transcript, staged copy and side folder but the kept session's
  readonly removeSessionsExcept: (home: GuestHome, keep: string | null) => void;

  // removes the CLI's config folder and the working directory, as a purge does
  readonly removeState: (home: GuestHome) => void;

  // removes every session transcript and side folder, whatever the home
  readonly removeAllSessions: () => void;
}

const configProjectsDir = '.claude/projects';
const workDirName = 'conversation';

// Builds the disk of a stub sandbox: a map of files that holds the CLI's session transcripts where
// the guest keeps them, under the config folder's projects folder.
export function buildStubGuestDisk(): StubGuestDisk {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();

  return {
    files,
    readSession: (home, sessionID) => {
      const bytes = files.get(join(getProjectDir(home), `${sessionID}.jsonl`));

      return bytes === undefined ? null : parseTranscript(bytes);
    },
    writeSession: (home, sessionID, entries) => {
      const lines = entries.map((entry) => JSON.stringify(entry));

      files.set(
        join(getProjectDir(home), `${sessionID}.jsonl`),
        new TextEncoder().encode(`${lines.join('\n')}\n`),
      );
    },
    removeSessionsExcept: (home, keep) => {
      const projectsDir = `${join(home.copyPath, configProjectsDir)}/`;

      for (const path of files.keys()) {
        if (path.startsWith(projectsDir) && !isKeptSession(path.slice(projectsDir.length), keep)) {
          files.delete(path);
        }
      }
    },
    removeState: (home) => {
      const roots = [join(home.copyPath, '.claude'), join(home.copyPath, workDirName)];

      for (const path of files.keys()) {
        if (roots.some((root) => path.startsWith(`${root}/`))) {
          files.delete(path);
        }
      }
    },
    removeAllSessions: () => {
      for (const path of files.keys()) {
        if (path.includes(`/${configProjectsDir}/`)) {
          files.delete(path);
        }
      }
    },
  };
}

// the CLI's project folder for the guest's working directory: the path its own processes see, with
// every character but a letter or a digit turned into a hyphen
function getProjectDir(home: GuestHome): string {
  const workDir = join(home.ownPath, workDirName);

  return join(home.copyPath, configProjectsDir, workDir.replaceAll(/[^a-zA-Z0-9]/gu, '-'));
}

function parseTranscript(bytes: Uint8Array): readonly StubSessionEntry[] {
  return new TextDecoder()
    .decode(bytes)
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => sessionEntrySchema.parse(JSON.parse(line)));
}

// a path under the projects folder is <project>/<id>.jsonl or <project>/<id>/<side file>
function isKeptSession(relative: string, keep: string | null): boolean {
  const name = relative.split('/')[1] ?? '';

  return keep !== null && (name === keep || name === `${keep}.jsonl`);
}
