import { expect, test } from 'bun:test';
import { parseErrorInfo } from './parse-error-info';

test.each([
  { title: 'a class name', info: 'unauthorized', expected: { name: 'unauthorized', status: null } },
  {
    title: 'a class with a status',
    info: { httpConnectionFailed: { httpStatusCode: 503 } },
    expected: { name: 'httpConnectionFailed', status: 503 },
  },
  {
    title: 'a class with no status',
    info: { responseStreamDisconnected: { httpStatusCode: null } },
    expected: { name: 'responseStreamDisconnected', status: null },
  },
  {
    title: 'a class with another shape',
    info: { activeTurnNotSteerable: { turnKind: 'review' } },
    expected: null,
  },
  { title: 'no info', info: undefined, expected: null },
])('it reads $title', (row) => {
  expect(parseErrorInfo(row.info)).toStrictEqual(row.expected);
});
