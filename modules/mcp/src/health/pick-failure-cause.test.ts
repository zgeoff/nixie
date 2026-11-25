import { expect, test } from 'bun:test';
import { UnauthorizedError } from '@modelcontextprotocol/client';
import { pickFailureCause } from './pick-failure-cause';

test.each([
  {
    title: 'a refused sign-in',
    error: new UnauthorizedError('Unauthorized'),
    cause: 'unauthorised',
  },
  {
    title: 'an abort on the listing timeout',
    error: new DOMException('The operation timed out.', 'TimeoutError'),
    cause: 'timeout',
  },
  { title: 'a refused connection', error: new TypeError('fetch failed'), cause: 'refused' },
  {
    title: 'a listing the client cannot read',
    error: new Error('Invalid result for tools/list: expected boolean, received string'),
    cause: 'unparsable',
  },
  { title: 'any other error', error: new Error('server error 503'), cause: 'error' },
  { title: 'a value that is no error', error: 'down', cause: 'error' },
])('it sorts $title as $cause', (row) => {
  expect(pickFailureCause(row.error)).toBe(row.cause);
});
