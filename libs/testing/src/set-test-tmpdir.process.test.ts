import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { readMemoryTmpdir } from './read-memory-tmpdir';

// A fresh process reads the host's own mounts, so each case runs only on a host whose /dev/shm
// matches it, and Bun 1.4's skipIf takes a boolean at collection time.
const hasMemoryTmpdir = readMemoryTmpdir() !== null;

async function setupTest() {
  const original = await mkdtemp(join('/var/tmp', 'nixie-tmpdir-'));

  onTestFinished(() => rm(original, { recursive: true, force: true }));

  return { original };
}

test.skipIf(!hasMemoryTmpdir)(
  'it puts a process temp directory and its temp files on /dev/shm when that is an executable tmpfs with room',
  async () => {
    const ctx = await setupTest();

    const child = Bun.spawn(
      [
        process.execPath,
        '--preload',
        join(import.meta.dir, 'set-test-tmpdir.ts'),
        '-e',
        "const os = require('node:os'); const fs = require('node:fs'); const path = require('node:path'); const made = fs.mkdtempSync(path.join(os.tmpdir(), 'harbour-')); fs.rmSync(made, { recursive: true }); console.log(JSON.stringify({ tmpdir: os.tmpdir(), made }));",
      ],
      { cwd: ctx.original, env: { ...process.env, TMPDIR: ctx.original }, stdout: 'pipe' },
    );

    const output = await new Response(child.stdout).text();

    expect(JSON.parse(output)).toStrictEqual({
      tmpdir: '/dev/shm',
      made: expect.toStartWith('/dev/shm/harbour-'),
    });
  },
);

test.skipIf(!hasMemoryTmpdir)(
  "it puts a test run's temp directory on /dev/shm through the repo's test configuration",
  async () => {
    const ctx = await setupTest();

    const probe = join(ctx.original, 'harbour.test.ts');

    await Bun.write(
      probe,
      "import { test } from 'bun:test';\nimport { tmpdir } from 'node:os';\n\ntest('it reports', () => {\n  console.log('tmpdir=' + tmpdir());\n});\n",
    );

    const child = Bun.spawn([process.execPath, 'test', probe], {
      cwd: join(import.meta.dir, '../../..'),
      env: { ...process.env, TMPDIR: ctx.original },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const output = await new Response(child.stdout).text();

    expect(output).toInclude('tmpdir=/dev/shm\n');
  },
);

test.skipIf(hasMemoryTmpdir)(
  'it keeps a process temp directory and its temp files where TMPDIR points when /dev/shm is unsuitable',
  async () => {
    const ctx = await setupTest();

    const child = Bun.spawn(
      [
        process.execPath,
        '--preload',
        join(import.meta.dir, 'set-test-tmpdir.ts'),
        '-e',
        "const os = require('node:os'); const fs = require('node:fs'); const path = require('node:path'); const made = fs.mkdtempSync(path.join(os.tmpdir(), 'harbour-')); fs.rmSync(made, { recursive: true }); console.log(JSON.stringify({ tmpdir: os.tmpdir(), made }));",
      ],
      { cwd: ctx.original, env: { ...process.env, TMPDIR: ctx.original }, stdout: 'pipe' },
    );

    const output = await new Response(child.stdout).text();

    expect(JSON.parse(output)).toStrictEqual({
      tmpdir: ctx.original,
      made: expect.toStartWith(`${ctx.original}/harbour-`),
    });
  },
);
