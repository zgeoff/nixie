import { expect, test } from 'bun:test';
import { buildPendingExec } from './build-pending-exec';

test('it starts the exec only once the wait resolves', async () => {
  const wait = Promise.withResolvers<void>();
  const exec = buildPendingExec(wait.promise, () => ({
    started: Promise.resolve('running'),
    stdout: new Response('out').body ?? new ReadableStream(),
    stderr: new Response('').body ?? new ReadableStream(),
    write: () => Promise.resolve(),
    closeStdin: () => Promise.resolve(),
    sendSignal: () => {},
    close: () => {},
    exit: Promise.resolve({ code: 0, signal: null }),
  }));

  const before = await Promise.race([exec.started, Promise.resolve('waiting')]);

  wait.resolve();
  const started = await exec.started;

  expect(before).toBe('waiting');
  expect(started).toBe('running');
  expect(new Response(exec.stdout).text()).resolves.toBe('out');
  expect(exec.exit).resolves.toStrictEqual({ code: 0, signal: null });
});

test('it rejects started and exit, and errors the output, when the exec fails to start', () => {
  const exec = buildPendingExec(Promise.resolve(), () => {
    throw new Error('the broker is not ready for this exec');
  });

  expect(exec.started).rejects.toThrow('the broker is not ready for this exec');
  expect(exec.exit).rejects.toThrow('the broker is not ready for this exec');
  expect(new Response(exec.stdout).text()).rejects.toThrow('the broker is not ready for this exec');
});
