import { expect, test } from 'bun:test';
import { pickMediaType } from './pick-media-type';

test.each([
  ['dist/chart.js', 'text/javascript; charset=utf-8'],
  ['DIST/Chart.JS', 'text/javascript; charset=utf-8'],
  ['style.css', 'text/css; charset=utf-8'],
  ['font.woff2', 'font/woff2'],
  ['LICENSE', 'application/octet-stream'],
  ['archive.tgz', 'application/octet-stream'],
  ['file.constructor', 'application/octet-stream'],
  ['constructor', 'application/octet-stream'],
  ['file.__proto__', 'application/octet-stream'],
  ['file.toString', 'application/octet-stream'],
])('#pickMediaType serves %s as %s', (path, expected) => {
  expect(pickMediaType(path)).toBe(expected);
});
