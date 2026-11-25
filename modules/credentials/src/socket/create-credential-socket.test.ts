import { expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { createCredentialSocket } from './create-credential-socket';

function setupTest(maxMessageBytes: number) {
  const wire = new PassThrough();

  const socket = createCredentialSocket(
    { socket: wire, head: Buffer.alloc(0) },
    [],
    maxMessageBytes,
  );

  // writes a frame of the server: unmasked, with a length under 126
  const writeFrame = (isFinal: boolean, opcode: number, text: string): void => {
    wire.write(
      Buffer.concat([Buffer.from([(isFinal ? 0x80 : 0) | opcode, text.length]), Buffer.from(text)]),
    );
  };

  const readAll = async () => {
    const texts: string[] = [];

    for await (const text of socket.messages) {
      texts.push(text);
    }

    return texts;
  };

  return { wire, writeFrame, readAll };
}

test('it joins the fragments of one message', async () => {
  const ctx = setupTest(1024);

  ctx.writeFrame(false, 0x1, 'ab');
  ctx.writeFrame(true, 0x0, 'cd');
  ctx.wire.end();

  const texts = await ctx.readAll();

  expect(texts).toStrictEqual(['abcd']);
});

test('it ends the stream when the fragments of one message pass the limit', async () => {
  const ctx = setupTest(10);

  ctx.writeFrame(false, 0x1, 'abcd');
  ctx.writeFrame(false, 0x0, 'efgh');
  ctx.writeFrame(false, 0x0, 'ijkl');
  ctx.writeFrame(true, 0x0, 'mn');

  const texts = await ctx.readAll();

  expect(texts).toStrictEqual([]);
});

test('it counts the limit again for the next message', async () => {
  const ctx = setupTest(10);

  ctx.writeFrame(false, 0x1, 'abcdef');
  ctx.writeFrame(true, 0x0, 'ghij');
  ctx.writeFrame(false, 0x1, 'abcdef');
  ctx.writeFrame(true, 0x0, 'ghij');
  ctx.wire.end();

  const texts = await ctx.readAll();

  expect(texts).toStrictEqual(['abcdefghij', 'abcdefghij']);
});
