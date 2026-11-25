import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { checkChromeVersion } from './check-chrome-version';
import type { ChromePin } from './parse-chrome-pin';
import { parseChromePin } from './parse-chrome-pin';

// The browser lane starts the Chrome that BUN_CHROME_PATH names. Without it, Bun takes whichever
// Chrome the host has, and a runner image update then changes the browser under the tests. A
// host that is not Linux on x64 has no pinned build, so it keeps its own Chrome.
const root = join(import.meta.dir, '..', '..');
const command = process.argv.slice(2);

if (command.length === 0) {
  throw new Error('usage: run-with-pinned-chrome.ts <command> [args...]');
}

const pinText = await Bun.file(join(root, 'chrome-pin.json')).text();

const pin = parseChromePin(pinText);

if (process.platform !== 'linux' || process.arch !== 'x64') {
  process.stderr.write('no pinned Chrome for this host; using the Chrome it has\n');
  process.exit(runCommand(process.env));
}

const pinnedChromePath = await installPinnedChrome(
  pin,
  join(root, 'node_modules/.cache/nixie-chrome'),
);

const versionOutput = Bun.spawnSync([pinnedChromePath, '--version']).stdout.toString();

checkChromeVersion('the pinned Chrome', versionOutput, pin.version);

process.stdout.write(`${versionOutput.trim()} (${pinnedChromePath})\n`);
process.exit(runCommand({ ...process.env, BUN_CHROME_PATH: pinnedChromePath }));

function runCommand(env: NodeJS.ProcessEnv): number {
  const result = Bun.spawnSync(command, {
    env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  return result.exitCode ?? 1;
}

async function installPinnedChrome(chrome: ChromePin, cacheDir: string): Promise<string> {
  const installDir = join(cacheDir, chrome.version);
  const chromePath = join(installDir, 'chrome-linux64', 'chrome');

  // The marker holds the checksum the install was checked against, so a new pin never reuses an
  // install that the old pin checked.
  const markerFile = Bun.file(join(installDir, 'pin-sha256'));

  const isInstalled = await markerFile.exists();

  if (isInstalled && (await markerFile.text()) === chrome.sha256) {
    return chromePath;
  }

  const url = `https://storage.googleapis.com/chrome-for-testing-public/${chrome.version}/linux64/chrome-linux64.zip`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`downloading ${url} failed with ${response.status}`);
  }

  const bytes = await response.bytes();

  const actual = new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

  if (actual !== chrome.sha256) {
    throw new Error(`${url} has SHA-256 ${actual}, but chrome-pin.json pins ${chrome.sha256}`);
  }

  // Unpack beside the final folder and rename, so a stopped run leaves no half-built install.
  const partDir = `${installDir}.part-${process.pid}`;

  await rm(partDir, { recursive: true, force: true });
  await mkdir(partDir, { recursive: true });

  await Bun.write(join(partDir, 'chrome.zip'), bytes);

  const unzip = Bun.spawnSync(['unzip', '-q', 'chrome.zip'], { cwd: partDir });

  if (unzip.exitCode !== 0) {
    throw new Error(`unzip failed: ${unzip.stderr.toString()}`);
  }

  await rm(join(partDir, 'chrome.zip'));

  await Bun.write(join(partDir, 'pin-sha256'), chrome.sha256);

  await rm(installDir, { recursive: true, force: true });
  await rename(partDir, installDir);

  return chromePath;
}
