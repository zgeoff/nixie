import { expect, mock, test } from 'bun:test';
import { buildStubHarnessChannel } from './build-stub-harness-channel';

test('it records each message nixie sends, in order', () => {
  const stub = buildStubHarnessChannel();

  stub.channel.send({ type: 'ready' });
  stub.channel.send({ type: 'reply', requestID: 1, result: null });

  expect(stub.sent).toStrictEqual([
    { type: 'ready' },
    { type: 'reply', requestID: 1, result: null },
  ]);
});

test('it delivers a harness message to every listener', () => {
  const stub = buildStubHarnessChannel();
  const first = mock();
  const second = mock();

  stub.channel.subscribe(first);
  stub.channel.subscribe(second);
  stub.sendToLink({ type: 'release', arrivalID: 1 });

  expect(first).toHaveBeenCalledExactlyOnceWith({ type: 'release', arrivalID: 1 });
  expect(second).toHaveBeenCalledExactlyOnceWith({ type: 'release', arrivalID: 1 });
});
