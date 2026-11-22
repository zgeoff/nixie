import { expect, test } from 'bun:test';
import { buildSocketURL } from './build-socket-url';

test.each([
  {
    stream: '/rpc/computer/watch-stream?ticket=abc',
    page: 'https://nixie.test/computer',
    expected: 'wss://nixie.test/rpc/computer/watch-stream?ticket=abc',
  },
  {
    stream: '/rpc/computer/watch-stream?ticket=abc',
    page: 'http://localhost:3000/computer',
    expected: 'ws://localhost:3000/rpc/computer/watch-stream?ticket=abc',
  },
  {
    stream: 'wss://nixie.test/rpc/computer/watch-stream?ticket=abc',
    page: 'https://other.test/computer',
    expected: 'wss://nixie.test/rpc/computer/watch-stream?ticket=abc',
  },
])('#buildSocketURL gives $expected for $stream on $page', (row) => {
  expect(buildSocketURL(row.stream, row.page)).toBe(row.expected);
});
