import { expect, mock, test } from 'bun:test';
import { checkBrowserSkip } from './check-browser-skip';

test('it fails in CI when the browser does not start, and never skips there', () => {
  const print = mock<(line: string) => void>(() => {});

  expect(
    checkBrowserSkip({
      env: { CI: 'true' },
      openView: () => Promise.reject(new Error('Chrome process closed the pipe')),
      print,
    }),
  ).rejects.toThrowWithMessage(Error, 'Chrome process closed the pipe');
});

test('it fails in CI with an Error when the browser start rejects with a non-error', () => {
  expect(
    checkBrowserSkip({
      env: { CI: 'true' },
      // oxlint-disable-next-line eslint/prefer-promise-reject-errors -- the test needs a rejection that is not an Error
      openView: () => Promise.reject('closed'),
      print: () => {},
    }),
  ).rejects.toStrictEqual(new Error('"closed"', { cause: 'closed' }));
});

test('it runs the browser tests in CI when the browser starts', async () => {
  const openView = mock(() => Promise.resolve());

  const result = await checkBrowserSkip({ env: { CI: 'true' }, openView, print: () => {} });

  expect(result).toStrictEqual({ isSkipped: false, reason: null });
  expect(openView).toHaveBeenCalledOnce();
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
