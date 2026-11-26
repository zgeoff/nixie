import { expect, test } from 'bun:test';
import { buildFakeSpeechLayer } from './build-fake-speech-layer';

test('#buildFakeSpeechLayer answers a browser offer with the same offer in the active role', async () => {
  const speech = buildFakeSpeechLayer();

  const opened = await speech.open({
    sdpOffer: 'v=0\r\na=setup:actpass\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n',
    instructions: 'prompt',
    voice: 'marin',
  });

  expect(opened).toMatchObject({
    sdpAnswer: 'v=0\r\na=setup:active\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n',
  });
});

test('#buildFakeSpeechLayer answers any other offer with a numbered stand-in', async () => {
  const speech = buildFakeSpeechLayer();

  const opened = await speech.open({ sdpOffer: 'offer', instructions: 'prompt', voice: 'marin' });

  expect(opened).toMatchObject({ sdpAnswer: 'fake-answer-1' });
});
