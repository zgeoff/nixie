import { join, relative } from 'node:path';
import type { GuestCommand, Sandbox } from '@heynixie/sandbox';
import invariant from 'tiny-invariant';

export interface KeptSessionSpec {
  readonly from: Sandbox;

  readonly to: Sandbox;
  readonly command: GuestCommand;

  // The first file is the one the guest resumes from, so the copy publishes it last. A path that
  // ends in a slash names a folder, whose files the copy carries.
  readonly files: readonly string[];
}

const stagedSuffix = '.copy';

// The CLI keeps transcripts here under the guest's home, because the guest sets CLAUDE_CONFIG_DIR.
const configProjectsDir = '.claude/projects';

// This must match the working directory that the conversation guest runs the CLI in.
const workDirName = 'conversation';

export async function writeKeptSession(spec: KeptSessionSpec): Promise<void> {
  if (spec.from.suspension.kind === 'memory') {
    await spec.from.suspension.wake();
  }

  const [transcript, ...rest] = spec.files;

  invariant(transcript !== undefined, 'a kept session names at least the file it resumes from');

  const source = await readSessionFiles(spec.from, spec.command, { transcript, rest });
  const target = await spec.to.resolveHome(spec.command.env);

  const targetDir = join(
    target.copyPath,
    configProjectsDir,
    buildProjectName(join(target.ownPath, workDirName)),
  );

  const files = await spec.from.copyOut(source.files.map((file) => join(source.projectDir, file)));

  // A copy that fails partway leaves only a staged transcript, which the CLI never resumes and the
  // guest removes with other stale sessions. The move below publishes the transcript in one step.
  await spec.to.copyIn(
    files.map((file) => {
      const path = relative(source.projectDir, file.path);
      const name = path === transcript ? `${transcript}${stagedSuffix}` : path;

      return { path: join(targetDir, name), content: file.content };
    }),
  );

  await spec.to.applyMove(
    join(targetDir, `${transcript}${stagedSuffix}`),
    join(targetDir, transcript),
  );
}

interface SessionFiles {
  readonly projectDir: string;

  readonly files: readonly string[];
}

interface SessionFileNames {
  readonly transcript: string;
  readonly rest: readonly string[];
}

async function readSessionFiles(
  sandbox: Sandbox,
  command: GuestCommand,
  names: SessionFileNames,
): Promise<SessionFiles> {
  const home = await sandbox.resolveHome(command.env);

  const projectsDir = join(home.copyPath, configProjectsDir);

  const transcripts = await sandbox.readFilePaths(projectsDir, { maxDepth: 2 });

  const transcript = transcripts
    .map((path) => path.split('/'))
    .find((parts) => parts.length === 2 && parts[1] === names.transcript);

  if (transcript === undefined) {
    throw new Error(`the sandbox ${sandbox.id} holds no transcript ${names.transcript}`);
  }

  const projectDir = join(projectsDir, transcript[0] ?? '');

  const restFiles = await Promise.all(
    names.rest.map((name) => readNamedFiles(sandbox, projectDir, name)),
  );

  return { projectDir, files: [names.transcript, ...restFiles.flat()] };
}

async function readNamedFiles(
  sandbox: Sandbox,
  projectDir: string,
  name: string,
): Promise<readonly string[]> {
  if (!name.endsWith('/')) {
    return [name];
  }

  const files = await sandbox.readFilePaths(join(projectDir, name.slice(0, -1)));

  return files.map((file) => join(name, file));
}

// The CLI names a project folder by turning each character but a letter or a digit into a hyphen.
// It also cuts a name past 200 characters and adds a hash, but no guest path is that long.
function buildProjectName(workDir: string): string {
  return workDir.replaceAll(/[^a-zA-Z0-9]/gu, '-');
}
