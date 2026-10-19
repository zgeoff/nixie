import { expect, mock, test } from 'bun:test';
import { checkBrowserSkip } from './check-browser-skip';

test('it never skips in CI, and never starts the browser there', async () => {
  const openView = mock(() => Promise.reject(new Error('Chrome process closed the pipe')));

  const result = await checkBrowserSkip({ env: { CI: 'true' }, openView, print: () => {} });

  expect(result).toStrictEqual({ isSkipped: false, reason: null });
  expect(openView).not.toHaveBeenCalled();
});

test('it skips outside CI when the browser does not start, and prints why', async () => {
  const print = mock<(line: string) => void>(() => {});

  const result = await checkBrowserSkip({
    env: {},
    openView: () => Promise.reject(new Error('Chrome process closed the pipe')),
    print,
  });

  expect(result).toStrictEqual({ isSkipped: true, reason: 'Chrome process closed the pipe' });

  expect(print).toHaveBeenCalledExactlyOnceWith(
    'the browser tests skip outside CI: the browser did not start (Chrome process closed the pipe)',
  );
});

test('it runs the browser tests outside CI when the browser starts', async () => {
  const print = mock<(line: string) => void>(() => {});

  const result = await checkBrowserSkip({ env: {}, openView: () => Promise.resolve(), print });

  expect(result).toStrictEqual({ isSkipped: false, reason: null });
  expect(print).not.toHaveBeenCalled();
});
