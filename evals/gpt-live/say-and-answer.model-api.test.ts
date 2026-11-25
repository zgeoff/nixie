import { expect, onTestFinished, test } from 'bun:test';
import type { SpeechEvent } from '@heynixie/calls';
import { systemClock } from '@heynixie/clock';
import {
  createCredentialStore,
  createOwnValueSet,
  deriveFingerprintKey,
} from '@heynixie/credentials';
import { resolveHostAddresses } from '@heynixie/egress';
import type { SidebandInit } from '@heynixie/speech-gpt-live';
import { buildGPTLiveSpeech, defaultGPTLiveModel } from '@heynixie/speech-gpt-live';
import { waitForCondition } from '@heynixie/testing';
import { chromium } from 'playwright-core';
import invariant from 'tiny-invariant';
import { z } from 'zod';

// The session costs a few seconds of GPT-Live time, so only a contract run enables it. It needs
// OPENAI_API_KEY, which stays in this process and goes to OpenAI through the credential store.
const isContractRun = process.env['NIXIE_SDK_CONTRACT'] === '1';

async function setupTest() {
  const apiURL = 'https://api.openai.com';

  const devicePage = `<!doctype html><script>
    const context = new AudioContext({ sampleRate: 48000 });
    const microphone = context.createMediaStreamDestination();
    const peer = new RTCPeerConnection();
    for (const track of microphone.stream.getAudioTracks()) peer.addTrack(track, microphone.stream);
    peer.createDataChannel('oai-events');
    window.createOffer = async () => {
      await context.resume();
      await peer.setLocalDescription(await peer.createOffer());
      await new Promise((resolve) => {
        peer.addEventListener('icegatheringstatechange', () => peer.iceGatheringState === 'complete' && resolve());
        setTimeout(resolve, 5000);
      });
      return peer.localDescription.sdp;
    };
    window.peerState = () => peer.connectionState;
    window.applyAnswer = (sdp) => peer.setRemoteDescription({ type: 'answer', sdp });
    window.speak = (base64) => new Promise((resolve) => {
      const pcm = new Int16Array(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer);
      const buffer = context.createBuffer(1, pcm.length, 24000);
      const samples = buffer.getChannelData(0);
      for (let index = 0; index < pcm.length; index++) samples[index] = pcm[index] / 32768;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(microphone);
      source.addEventListener('ended', resolve);
      source.start();
    });
  </script>`;

  const receivedEvent = z.object({
    type: z.string(),
    client_event_id: z.string().optional(),
    delta: z.string().optional(),
  });

  const key = process.env['OPENAI_API_KEY'];

  invariant(key !== undefined && key !== '', 'OPENAI_API_KEY holds the key for the session');

  const store = createCredentialStore({
    secrets: {
      readFileValue: () => key,
      fingerprintKey: await deriveFingerprintKey(Buffer.alloc(32, 3)),
      ownValues: createOwnValueSet(),
    },
    resolveHost: resolveHostAddresses,
    denied: [],
  });

  const binding = store.register(
    { backend: 'file', group: 'connector_credentials', name: 'speech' },
    { kind: 'static', label: 'GPT-Live', origins: [apiURL] },
  );

  const fetchWithKey = store.fetcher(binding, [apiURL]);

  // what the provider sent down the sideband, for the checks that the layer's own events omit
  const received: z.infer<typeof receivedEvent>[] = [];

  const speech = buildGPTLiveSpeech({
    fetch: Object.assign((input: string, init?: RequestInit) => fetchWithKey(input, init), {
      openSocket: async (url: string, init?: SidebandInit) => {
        const socket = await fetchWithKey.openSocket(url, init);

        return {
          send: socket.send,
          close: socket.close,
          messages: (async function* teeMessages() {
            for await (const text of socket.messages) {
              const parsed = receivedEvent.safeParse(JSON.parse(text));

              if (parsed.success) {
                received.push(parsed.data);
              }

              yield text;
            }
          })(),
        };
      },
    }),
    apiURL,
    model: defaultGPTLiveModel,
    clock: systemClock,
    logEvent: () => {},
  });

  const request = await fetchWithKey(`${apiURL}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'tts-1',
      voice: 'alloy',
      input: "What's on my calendar tomorrow morning?",
      response_format: 'pcm',
    }),
  });

  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  onTestFinished(() => browser.close());

  const page = await browser.newPage();

  await page.setContent(devicePage);

  const speechBytes = await request.arrayBuffer();

  return { speech, received, page, request: Buffer.from(speechBytes) };
}

test.skipIf(!isContractRun)(
  'it opens a real GPT-Live session, hands off a request, and speaks one line and one answer',
  async () => {
    const ctx = await setupTest();
    const rawOffer = await ctx.page.evaluate('window.createOffer()');

    const offer = z.string().parse(rawOffer);

    const opened = await ctx.speech.open({
      sdpOffer: offer,
      instructions:
        'You are the voice of an assistant. Hand every request to the backend, and say what it sends.',
      voice: 'marin',
    });

    invariant(!('error' in opened), 'the provider opened the session');

    await ctx.page.evaluate(`window.applyAnswer(${JSON.stringify(opened.sdpAnswer)})`);

    const events: SpeechEvent[] = [];

    void (async () => {
      for await (const event of ctx.speech.events(opened.sessionID)) {
        events.push(event);
      }
    })();

    await waitForCondition(
      async () => (await ctx.page.evaluate('window.peerState()')) === 'connected',
      { timeoutMs: 30_000 },
    );

    const speakCall = `window.speak(${JSON.stringify(ctx.request.toString('base64'))})`;

    await ctx.page.evaluate(speakCall);

    await waitForCondition(() => events.some((event) => event.kind === 'hand_off'), {
      timeoutMs: 30_000,
    });

    const handOff = events.find((event) => event.kind === 'hand_off');

    invariant(handOff?.kind === 'hand_off', 'the speech became a hand-off');

    await ctx.speech.say(opened.sessionID, 'Just a moment while I look that up.');

    await ctx.speech.answer(
      opened.sessionID,
      handOff.handOffID,
      'Tomorrow morning you have a dentist check-up at nine.',
      true,
    );

    await waitForCondition(
      () =>
        ctx.received.filter((event) => event.type === 'session.commentary.appended').length >= 2,
      { timeoutMs: 30_000 },
    );

    // acknowledging a commentary does not mean the provider speaks it, so both lines must show in
    // what the speech layer said
    const readSpoken = () =>
      ctx.received
        .filter((event) => event.type === 'session.output_transcript.delta')
        .map((event) => event.delta)
        .join('')
        .toLowerCase();

    await waitForCondition(
      () => readSpoken().includes('dentist') && readSpoken().includes('moment'),
      {
        timeoutMs: 30_000,
      },
    );

    await ctx.speech.close(opened.sessionID);

    expect(handOff.request).toInclude('calendar');
    expect(readSpoken()).toInclude('moment');
    expect(readSpoken()).toInclude('dentist');
    expect(ctx.received.filter((event) => event.type === 'error')).toStrictEqual([]);

    expect(
      ctx.received
        .filter((event) => event.type === 'session.commentary.appended')
        .map((event) => event.client_event_id?.split('_')[0]),
    ).toStrictEqual(['say', 'answer']);
  },
  120_000,
);
