import { join, relative } from 'node:path';
import type { GuestCommand, Sandbox } from '@heynixie/sandbox';

export interface KeptSessionSpec {
  // the sandbox the conversation leaves, which still holds the session
  readonly from: Sandbox;

  // the sandbox that replaces it, which the session goes into
  readonly to: Sandbox;
  readonly command: GuestCommand;
  readonly sessionID: string;
}

// Writes the session's transcript and side folder from the sandbox the conversation leaves into
// the one that replaces it, under the project folder that the new guest's own path names. It
// overwrites a stopped copy, and wakes a sleeping old sandbox, whose guest may run the list.
export async function writeKeptSession(spec: KeptSessionSpec): Promise<void> {
  if (spec.from.suspension.kind === 'memory') {
    await spec.from.suspension.wake();
  }

  const source = await findSessionFiles(spec.from, spec.command, spec.sessionID);
  const target = await spec.to.resolveHome(spec.command.env);

  const targetDir = join(
    target.copyPath,
    configProjectsDir,
    buildProjectName(join(target.ownPath, workDirName)),
  );

  const transcript = `${spec.sessionID}.jsonl`;

  const files = await spec.from.copyOut(source.files.map((file) => join(source.projectDir, file)));

  // the transcript lands under a staged name, so a copy that fails partway leaves no session to
  // resume; the guest removes the staged file with the other stale sessions
  await spec.to.copyIn(
    files.map((file) => {
      const path = relative(source.projectDir, file.path);
      const name = path === transcript ? `${transcript}${stagedSuffix}` : path;

      return { path: join(targetDir, name), content: file.content };
    }),
  );

  // the move publishes the transcript in one step, once every file of the session has landed
  await spec.to.applyMove(
    join(targetDir, `${transcript}${stagedSuffix}`),
    join(targetDir, transcript),
  );
}

const stagedSuffix = '.copy';

// the CLI's projects folder under the guest's home, as the guest sets CLAUDE_CONFIG_DIR
const configProjectsDir = '.claude/projects';

// the guest's working directory under its home, which getWorkDir in the conversation guest sets
const workDirName = 'conversation';

interface SessionFiles {
  // the project folder that holds the session, as a path the sandbox's copyOut takes
  readonly projectDir: string;

  // the session's files, relative to the project folder: <id>.jsonl, and <id>/... for the side folder
  readonly files: readonly string[];
}

// Finds the session's files in the sandbox, under the first project folder that holds its
// transcript. A sandbox that holds no transcript of the session throws.
async function findSessionFiles(
  sandbox: Sandbox,
  command: GuestCommand,
  sessionID: string,
): Promise<SessionFiles> {
  const home = await sandbox.resolveHome(command.env);

  const projectsDir = join(home.copyPath, configProjectsDir);

  const listed = await sandbox.collectFiles(projectsDir);

  const transcript = listed
    .map((path) => path.split('/'))
    .find((parts) => parts.length === 2 && parts[1] === `${sessionID}.jsonl`);

  if (transcript === undefined) {
    throw new Error(`the sandbox ${sandbox.id} holds no transcript of session ${sessionID}`);
  }

  const project = `${transcript[0] ?? ''}/`;

  return {
    projectDir: join(projectsDir, project),
    files: listed
      .filter((path) => path.startsWith(project))
      .map((path) => path.slice(project.length))
      .filter((file) => file === `${sessionID}.jsonl` || file.startsWith(`${sessionID}/`)),
  };
}

// The CLI's project folder name for a working directory: every character but a letter or a digit
// becomes a hyphen. The CLI cuts a name past 200 characters and adds a hash, which no guest's path
// reaches; a copy to such a path lands where the CLI does not look, and the next turn starts fresh.
function buildProjectName(workDir: string): string {
  return workDir.replaceAll(/[^a-zA-Z0-9]/gu, '-');
}
