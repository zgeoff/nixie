import { join } from 'node:path';
import { z } from 'zod';
import type { GuestHome } from '../types';

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
  readonly files: Map<string, Uint8Array<ArrayBuffer>>;

  readonly readSession: (home: GuestHome, sessionID: string) => readonly StubSessionEntry[] | null;

  readonly writeSession: (
    home: GuestHome,
    sessionID: string,
    entries: readonly StubSessionEntry[],
  ) => void;

  readonly removeSessionsExcept: (home: GuestHome, keep: string | null) => void;

  readonly removeState: (home: GuestHome) => void;

  readonly removeAllSessions: () => void;
}

const configProjectsDir = '.claude/projects';
const workDirName = 'conversation';

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

// The CLI names a project folder for the working directory that its processes see, with every
// character but a letter or a digit turned into a hyphen.
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

function isKeptSession(relative: string, keep: string | null): boolean {
  const name = relative.split('/')[1] ?? '';

  return keep !== null && (name === keep || name === `${keep}.jsonl`);
}
