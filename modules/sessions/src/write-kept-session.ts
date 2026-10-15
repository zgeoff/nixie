import { join, relative } from 'node:path';
import type { FileSpec, Sandbox } from '@heynixie/sandbox';
import type { GuestCommand } from './run-guest-turn';

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
// overwrites what a stopped copy left, and wakes a sleeping old sandbox first for the read.
export async function writeKeptSession(spec: KeptSessionSpec): Promise<void> {
  if (spec.from.suspension.kind === 'memory') {
    await spec.from.suspension.wake();
  }

  const files = await readKeptFiles(spec.from, spec.command, spec.sessionID);
  const target = await readGuestLayout(spec.to, spec.command, spec.sessionID);

  const targetDir = join(
    target.guestHome,
    configProjectsDir,
    buildProjectName(join(target.home, workDirName)),
  );

  const transcript = `${spec.sessionID}.jsonl`;

  // the transcript lands under a staged name, so a copy that fails partway leaves no session to
  // resume; the guest removes the staged file with the other stale sessions
  await spec.to.copyIn(
    files.map((file) => {
      const name = file.path === transcript ? `${transcript}${stagedSuffix}` : file.path;

      return { path: join(targetDir, name), content: file.content };
    }),
  );

  await applyStagedTranscript(spec, targetDir, transcript);
}

const stagedSuffix = '.copy';

// Renames the staged transcript to the name the CLI resumes, in one step inside the guest, once
// every file of the session has landed.
async function applyStagedTranscript(
  spec: KeptSessionSpec,
  targetDir: string,
  transcript: string,
): Promise<void> {
  const result = await spec.to.exec({
    argv: ['mv', '-f', '--', `${transcript}${stagedSuffix}`, transcript],
    env: spec.command.env,
    cwd: targetDir,
  });

  if (result.code !== 0) {
    const stderr = new TextDecoder().decode(result.stderr.bytes);

    throw new Error(`the sandbox ${spec.to.id} did not publish the session transcript: ${stderr}`);
  }
}

// the CLI's projects folder under the guest's home, as the guest sets CLAUDE_CONFIG_DIR
const configProjectsDir = '.claude/projects';

// the guest's working directory under its home, which getWorkDir in the conversation guest sets
const workDirName = 'conversation';

// Reads the session's files out of the sandbox, each with its path inside the project folder. A
// sandbox that holds no transcript of the session throws.
async function readKeptFiles(
  sandbox: Sandbox,
  command: GuestCommand,
  sessionID: string,
): Promise<readonly FileSpec[]> {
  const source = await readGuestLayout(sandbox, command, sessionID);

  const transcript = source.files.find((file) => isTranscript(file, sessionID));

  if (transcript === undefined) {
    throw new Error(`the sandbox ${sandbox.id} holds no transcript of session ${sessionID}`);
  }

  const projectDir = join(source.guestHome, configProjectsDir, transcript.split('/')[0] ?? '');

  const files = await sandbox.copyOut(
    source.files
      .map((file) => join(source.guestHome, configProjectsDir, file))
      .filter((path) => path.startsWith(`${projectDir}/`)),
  );

  return files.map((file) => ({ path: relative(projectDir, file.path), content: file.content }));
}

function isTranscript(file: string, sessionID: string): boolean {
  return file.endsWith(`/${sessionID}.jsonl`);
}

interface GuestLayout {
  // the guest's home as a path the sandbox's copyIn and copyOut take
  readonly guestHome: string;

  // the guest's home as its own processes see it, which the CLI's project folder name comes from
  readonly home: string;

  // the session's files, relative to the projects folder, such as <project>/<id>.jsonl
  readonly files: readonly string[];
}

// Prints the guest's home from the guest's root and as its processes see it, which differ in a
// process sandbox that maps a host folder to the root, then the session's files.
const layoutScript = `root=$(pwd -P) && home=$(cd "$HOME" && pwd -P) || exit 1
case $home in "$root"*) ;; *) echo "HOME $home is outside the guest root $root" >&2; exit 1 ;; esac
printf '%s\\n%s\\n' "/\${home#"$root"}" "$home"
cd "$home/${configProjectsDir}" 2>/dev/null || exit 0
find . -mindepth 2 \\( -path "./*/$1.jsonl" -o -path "./*/$1/*" \\) -type f`;

async function readGuestLayout(
  sandbox: Sandbox,
  command: GuestCommand,
  sessionID: string,
): Promise<GuestLayout> {
  const result = await sandbox.exec({
    argv: ['sh', '-c', layoutScript, 'sh', sessionID],
    env: command.env,
    cwd: '/',
  });

  if (result.code !== 0 || result.stdout.isCut) {
    const stderr = new TextDecoder().decode(result.stderr.bytes);

    throw new Error(`the sandbox ${sandbox.id} did not list its session files: ${stderr}`);
  }

  const lines = new TextDecoder().decode(result.stdout.bytes).split('\n');

  const [guestHome = '', home = '', ...files] = lines.filter((line) => line !== '');

  return { guestHome, home, files: files.map((file) => file.replace(/^\.\//u, '')) };
}

// The CLI's project folder name for a working directory: every character but a letter or a digit
// becomes a hyphen. The CLI cuts a name past 200 characters and adds a hash, which no guest's path
// reaches; a copy to such a path lands where the CLI does not look, and the next turn starts fresh.
function buildProjectName(workDir: string): string {
  return workDir.replaceAll(/[^a-zA-Z0-9]/gu, '-');
}
