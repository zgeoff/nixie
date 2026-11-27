import { expect, test } from 'bun:test';
import { parseServerPin } from './parse-server-pin.ts';

test.each([
  {
    title: 'one server image',
    text: `image: ghcr.io/zgeoff/nixie:0.7.2@sha256:${'a'.repeat(64)}\n`,
    pin: { version: '0.7.2' },
  },
  {
    title: 'the same server image in 2 services, beside a web image of the same release',
    text: [
      `    image: ghcr.io/zgeoff/nixie:0.7.2@sha256:${'a'.repeat(64)}`,
      `    image: ghcr.io/zgeoff/nixie-web:0.7.2@sha256:${'b'.repeat(64)}`,
      `    image: ghcr.io/zgeoff/nixie:0.7.2@sha256:${'a'.repeat(64)}`,
      '',
    ].join('\n'),
    pin: { version: '0.7.2' },
  },
  {
    title: 'a web image of another release',
    text: [
      `image: ghcr.io/zgeoff/nixie:0.7.2@sha256:${'a'.repeat(64)}`,
      `image: ghcr.io/zgeoff/nixie-web:0.6.0@sha256:${'b'.repeat(64)}`,
      '',
    ].join('\n'),
    pin: { version: '0.7.2' },
  },
])('it reads the release of $title', (row) => {
  expect(parseServerPin(row.text)).toStrictEqual(row.pin);
});

test.each([
  {
    title: 'a server image without a digest',
    text: 'image: ghcr.io/zgeoff/nixie:0.7.2\n',
    problem: 'names no ghcr.io/zgeoff/nixie image by tag and digest',
  },
  {
    title: 'only a web image',
    text: `image: ghcr.io/zgeoff/nixie-web:0.7.2@sha256:${'b'.repeat(64)}\n`,
    problem: 'names no ghcr.io/zgeoff/nixie image by tag and digest',
  },
  {
    title: 'server images of 2 releases',
    text: [
      `image: ghcr.io/zgeoff/nixie:0.7.2@sha256:${'a'.repeat(64)}`,
      `image: ghcr.io/zgeoff/nixie:0.8.0@sha256:${'c'.repeat(64)}`,
      '',
    ].join('\n'),
    problem: 'pins more than one nixie release: 0.7.2, 0.8.0',
  },
])('it refuses $title', (row) => {
  expect(parseServerPin(row.text)).toStrictEqual({ problem: row.problem });
});
