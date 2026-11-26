import { expect, test } from 'bun:test';
import { buildStubCallEnvironment } from './build-stub-call-environment';

test('#buildStubCallEnvironment opens a microphone with one live track', async () => {
  const stub = buildStubCallEnvironment({ microphoneError: null });

  const microphone = await stub.environment.openMicrophone();

  expect([microphone.getTracks().length, stub.microphoneRequests()]).toStrictEqual([1, 1]);
});

test('#buildStubCallEnvironment refuses the microphone with the error it is given', () => {
  const stub = buildStubCallEnvironment({ microphoneError: new Error('blocked') });

  expect(stub.environment.openMicrophone()).rejects.toThrow('blocked');
});

test('#buildStubCallEnvironment numbers the offers of a peer and records each answer', async () => {
  const stub = buildStubCallEnvironment({ microphoneError: null });
  const peer = stub.environment.createPeer();

  const first = await peer.makeOffer({ isRestart: false });
  const second = await peer.makeOffer({ isRestart: true });

  await peer.applyAnswer('answer');

  expect([first, second, stub.peers[0]?.answers]).toStrictEqual(['offer-1', 'offer-2', ['answer']]);
});

test('#buildStubCallEnvironment tells a peer connection listener of a new state', () => {
  const stub = buildStubCallEnvironment({ microphoneError: null });
  const peer = stub.environment.createPeer();
  const seen: string[] = [];

  peer.onConnectionState((state) => {
    seen.push(state);
  });

  stub.peers[0]?.emitConnectionState('failed');
  expect([seen, peer.readConnectionState()]).toStrictEqual([['failed'], 'failed']);
});
