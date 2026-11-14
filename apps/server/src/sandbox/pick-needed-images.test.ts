import { expect, test } from 'bun:test';
import { pickNeededImages } from './pick-needed-images';

function setupTest() {
  return {
    conversation: { name: 'nixie-conversation-aaaaaaaaaaaa', ref: 'r/c@sha256:aa' },
    fetch: { name: 'nixie-fetch-bbbbbbbbbbbb', ref: 'r/f@sha256:bb' },
  };
}

test('it returns only the images that a need names', () => {
  const ctx = setupTest();
  const images = { conversation: ctx.conversation, fetch: ctx.fetch };

  expect(
    pickNeededImages(images, [{ key: 'fetch', neededBy: 'the web_fetch part' }]),
  ).toStrictEqual({ fetch: ctx.fetch });
});

test('it throws the refusal for a need whose image is missing', () => {
  const ctx = setupTest();

  expect(() =>
    pickNeededImages({ conversation: ctx.conversation }, [
      { key: 'fetch', neededBy: 'the web_fetch part' },
    ]),
  ).toThrow(
    'nixie refuses to start: the web_fetch part needs the fetch image, and the sandbox manifest holds conversation',
  );
});

test('it says the manifest holds no image when it holds none', () => {
  expect(() => pickNeededImages({}, [{ key: 'fetch', neededBy: 'the web_fetch part' }])).toThrow(
    'nixie refuses to start: the web_fetch part needs the fetch image, and the sandbox manifest holds no image',
  );
});

test('it names each missing image and what needs it in one error', () => {
  expect(() =>
    pickNeededImages({}, [
      { key: 'conversation', neededBy: 'the profile chat-main on the agent-sdk harness' },
      { key: 'fetch', neededBy: 'the web_fetch part' },
    ]),
  ).toThrow(
    'nixie refuses to start: the profile chat-main on the agent-sdk harness needs the conversation image; the web_fetch part needs the fetch image, and the sandbox manifest holds no image',
  );
});
