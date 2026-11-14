import { expect, test } from 'bun:test';
import { decodeFetchHopPass } from './decode-fetch-hop-pass';

test('it accepts a hop-pass frame', () => {
  expect(() => {
    decodeFetchHopPass(new TextEncoder().encode('{"kind":"hop-pass"}'));
  }).not.toThrow();
});

test('it refuses a frame of another kind', () => {
  expect(() => {
    decodeFetchHopPass(new TextEncoder().encode('{"kind":"failed","reason":"no"}'));
  }).toThrowWithMessage(TypeError, /hop-pass/u);
});
