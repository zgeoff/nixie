import { expect, test } from 'bun:test';
import { buildStubProcessIO } from './build-stub-process-io';

test('it yields the given stdout chunks, then closes stdout', async () => {
  const stub = buildStubProcessIO({
    stdout: [new Uint8Array([1]), new Uint8Array([2])],
    stderr: [],
  });

  const chunks = await Array.fromAsync(stub.io.stdout);

  expect(chunks).toStrictEqual([new Uint8Array([1]), new Uint8Array([2])]);
});

test('it yields the given stderr chunks, then closes stderr', async () => {
  const stub = buildStubProcessIO({ stdout: [], stderr: [new Uint8Array([3])] });

  const chunks = await Array.fromAsync(stub.io.stderr);

  expect(chunks).toStrictEqual([new Uint8Array([3])]);
});

test('it records each write to stdin in order', async () => {
  const stub = buildStubProcessIO({ stdout: [], stderr: [] });

  await stub.io.write(new Uint8Array([1]));
  await stub.io.write(new Uint8Array([2]));

  expect(stub.written).toStrictEqual([new Uint8Array([1]), new Uint8Array([2])]);
});

test('it ends the process with SIGTERM on a stop', () => {
  const stub = buildStubProcessIO({ stdout: [], stderr: [] });

  stub.io.stop();

  expect(stub.io.exit).resolves.toStrictEqual({ code: null, signal: 'SIGTERM' });
});

test('it sends SIGTERM once when stop is called twice', () => {
  const stub = buildStubProcessIO({ stdout: [], stderr: [] });

  stub.io.stop();
  stub.io.stop();

  expect(stub.signals).toStrictEqual(['SIGTERM']);
});

test('it ends the process with the exit the test gives', () => {
  const stub = buildStubProcessIO({ stdout: [], stderr: [] });

  stub.end({ code: 0, signal: null });

  expect(stub.io.exit).resolves.toStrictEqual({ code: 0, signal: null });
});
