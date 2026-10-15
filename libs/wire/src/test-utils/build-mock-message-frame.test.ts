import { expect, test } from 'bun:test';
import { hostFrameSchema } from '../host-frame';
import { buildMockMessageFrame } from './build-mock-message-frame';

test('it builds a default message frame', () => {
  const frame = buildMockMessageFrame();

  expect(frame).toStrictEqual({
    type: 'message',
    message: { uuid: expect.toBeString(), text: expect.toBeString() },
  });

  expect(hostFrameSchema.parse(frame)).toStrictEqual(frame);
});

test('it applies overrides on top of the defaults', () => {
  expect(buildMockMessageFrame({ message: { text: 'Also, buy bread.' } })).toStrictEqual({
    type: 'message',
    message: { uuid: expect.toBeString(), text: 'Also, buy bread.' },
  });
});
