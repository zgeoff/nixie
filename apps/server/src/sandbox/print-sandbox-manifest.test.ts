import { expect, test } from 'bun:test';
import { printSandboxManifest } from './print-sandbox-manifest';

function setupTest() {
  return {
    conversation: { name: 'nixie-conversation-aaaaaaaaaaaa', ref: 'r/c@sha256:aa' },
    fetch: { name: 'nixie-fetch-bbbbbbbbbbbb', ref: 'r/f@sha256:bb' },
  };
}

test('it prints every image when it takes no needs', () => {
  const ctx = setupTest();
  const images = { conversation: ctx.conversation, fetch: ctx.fetch };

  expect(printSandboxManifest(images, null)).toBe(JSON.stringify(images));
});

test('it prints only the needed images', () => {
  const ctx = setupTest();
  const images = { conversation: ctx.conversation, fetch: ctx.fetch };

  const printed = printSandboxManifest(images, [
    { key: 'conversation', neededBy: 'the profile chat on the agent-sdk harness' },
  ]);

  expect(printed).toBe(JSON.stringify({ conversation: ctx.conversation }));
});

test('it refuses a need that the images lack', () => {
  const ctx = setupTest();
  const needs = [{ key: 'fetch', neededBy: 'the web_fetch part' }] as const;

  expect(() => printSandboxManifest({ conversation: ctx.conversation }, needs)).toThrow(
    'the web_fetch part needs the fetch image',
  );
});
