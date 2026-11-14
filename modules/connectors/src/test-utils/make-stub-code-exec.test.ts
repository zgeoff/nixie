import { expect, test } from 'bun:test';
import { makeStubCodeExec } from './make-stub-code-exec';

function setupTest() {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();

  return {
    files,
    guest: { sandboxID: 'sandbox-1', files },
  };
}

test('it answers the setup command with success', async () => {
  const ctx = setupTest();
  const exec = makeStubCodeExec(() => ({}));

  const result = await exec({ argv: ['sh', '-c', 'true'] }, ctx.guest, undefined);

  expect(result.code).toBe(0);
});

test('it writes the files of the program under /work and lists those under out/', async () => {
  const ctx = setupTest();

  const exec = makeStubCodeExec(() => ({
    writes: { 'out/a.txt': 'hello', 'scratch.txt': 'x' },
    stdout: 'done',
  }));

  const program = await exec({ argv: ['setpriv', '--', 'python3'] }, ctx.guest, undefined);
  const listing = await exec({ argv: ['find', '/work/out'] }, ctx.guest, undefined);

  expect(program.stdout.totalBytes).toBe(4);
  expect(new TextDecoder().decode(listing.stdout.bytes)).toBe('5 a.txt\0');
});

test('it cuts the listing at the bytes asked, and says so', async () => {
  const ctx = setupTest();

  const exec = makeStubCodeExec(() => ({ writes: { 'out/a.txt': 'hello' } }), {
    listingCutBytes: 3,
  });

  await exec({ argv: ['setpriv'] }, ctx.guest, undefined);

  const listing = await exec({ argv: ['find'] }, ctx.guest, undefined);

  expect(listing.stdout).toMatchObject({ isCut: true, totalBytes: 8 });
});

test('it ends a hanging program on SIGTERM once its signal aborts', async () => {
  const ctx = setupTest();

  const stop = new AbortController();

  const exec = makeStubCodeExec(() => ({ isHanging: true }));
  const running = exec({ argv: ['setpriv'] }, ctx.guest, stop.signal);

  stop.abort();

  const exit = await running;

  expect(exit).toMatchObject({ code: null, signal: 'SIGTERM' });
});

test('it refuses a command it does not know', async () => {
  const ctx = setupTest();
  const exec = makeStubCodeExec(() => ({}));

  await expect(exec({ argv: ['rm', '-rf', '/'] }, ctx.guest, undefined)).rejects.toThrow();
});
