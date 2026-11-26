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

// Opens a real session from a headless device, plays the question into its microphone, and returns
// once the speech layer has handed the question off.
async function setupTest(question: string) {
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
    session: z.object({ expires_at: z.unknown() }).partial().optional(),
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

  // what the provider sent down the sideband, with the time each event arrived, for the checks
  // that the layer's own events omit
  const received: (z.infer<typeof receivedEvent> & { readonly atMs: number })[] = [];

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
                received.push({ ...parsed.data, atMs: performance.now() });
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
      input: question,
      response_format: 'pcm',
    }),
  });

  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });

  onTestFinished(() => browser.close());

  const page = await browser.newPage();

  await page.setContent(devicePage);

  const questionBytes = await request.arrayBuffer();

  const questionAudio = Buffer.from(questionBytes).toString('base64');

  const rawOffer = await page.evaluate('window.createOffer()');

  const opened = await speech.open({
    sdpOffer: z.string().parse(rawOffer),
    instructions:
      'You are the voice of an assistant. Hand every request to the backend, and say what it sends.',
    voice: 'marin',
  });

  invariant(!('error' in opened), 'the provider opened the session');
  onTestFinished(() => speech.close(opened.sessionID));

  await page.evaluate(`window.applyAnswer(${JSON.stringify(opened.sdpAnswer)})`);

  const events: SpeechEvent[] = [];

  void (async () => {
    for await (const event of speech.events(opened.sessionID)) {
      events.push(event);
    }
  })();

  await waitForCondition(async () => (await page.evaluate('window.peerState()')) === 'connected', {
    timeoutMs: 30_000,
  });

  await page.evaluate(`window.speak(${JSON.stringify(questionAudio)})`);

  await waitForCondition(() => events.some((event) => event.kind === 'hand_off'), {
    timeoutMs: 30_000,
  });

  const handOff = events.find((event) => event.kind === 'hand_off');

  invariant(handOff?.kind === 'hand_off', 'the speech became a hand-off');

  return {
    speech,
    received,
    handOff,
    sessionID: opened.sessionID,
    readSpoken: () =>
      received
        .filter((event) => event.type === 'session.output_transcript.delta')
        .map((event) => event.delta)
        .join('')
        .toLowerCase(),
    readLastSpokenAtMs: () =>
      received.findLast((event) => event.type === 'session.output_transcript.delta')?.atMs ?? 0,
  };
}

test.skipIf(!isContractRun)(
  'it opens a real GPT-Live session, hands off a request, and speaks one line and one answer',
  async () => {
    const ctx = await setupTest("What's on my calendar tomorrow morning?");

    // The say line holds a code word that the speech layer would not choose, so hearing it proves
    // the line itself was spoken, and not an acknowledgement of the speech layer's own. The answer
    // goes only after that, so what follows the code word in the transcript is the answer.
    await ctx.speech.say(ctx.sessionID, 'Hold on, still checking. The code word is tangerine.');

    await waitForCondition(() => ctx.readSpoken().includes('tangerine'), { timeoutMs: 30_000 });

    const spokenBeforeAnswer = ctx.readSpoken().length;

    await ctx.speech.answer(
      ctx.sessionID,
      ctx.handOff.handOffID,
      'Tomorrow morning you have a dentist check-up at nine.',
      true,
    );

    await waitForCondition(() => ctx.readSpoken().slice(spokenBeforeAnswer).includes('dentist'), {
      timeoutMs: 30_000,
    });

    const started = ctx.received.find((event) => event.type === 'session.started');

    expect(ctx.handOff.request).toInclude('calendar');
    expect(ctx.readSpoken()).toInclude('tangerine');
    expect(ctx.readSpoken().slice(spokenBeforeAnswer)).toInclude('dentist');
    expect(ctx.received.filter((event) => event.type === 'error')).toStrictEqual([]);
    expect(started?.session?.expires_at).toBeNumber();

    expect(
      ctx.received
        .filter((event) => event.type === 'session.commentary.appended')
        .map((event) => event.client_event_id?.split('_')[0]),
    ).toStrictEqual(['say', 'answer']);
  },
  120_000,
);

test.skipIf(!isContractRun)(
  'it speaks every sentence of an answer split into several commentaries, in order',
  async () => {
    const ctx = await setupTest('What do I have on this week?');

    // Each sentence holds one marker word, so the transcript shows whether GPT-Live spoke every
    // sentence and in order. The text runs past one commentary's limit.
    const facts = [
      [
        'plumber',
        'On Monday at eight in the morning, the plumber comes to replace the washer on the kitchen tap.',
      ],
      ['noodle', 'On Monday at noon, you have lunch with Priya at the noodle bar on Station Road.'],
      [
        'recycling',
        'On Monday evening, the recycling bin goes out, because collection moved to Tuesday this week.',
      ],
      ['dentist', 'On Tuesday at nine, the dentist sees you for a check-up on Elm Street.'],
      [
        'library',
        'On Tuesday afternoon, the library wants the two overdue books back before it closes at five.',
      ],
      ['choir', 'On Tuesday night, the school choir sings at the town hall, starting at seven.'],
      [
        'garage',
        'On Wednesday morning, your car has its yearly service at the garage on Mill Lane.',
      ],
      ['mortgage', 'On Wednesday at three, the bank calls you about the mortgage renewal.'],
      [
        'pottery',
        'On Wednesday evening, the pottery class meets at half past six in the old school.',
      ],
      ['electrician', 'On Thursday at ten, the electrician checks the fuse box in the hallway.'],
      [
        'accountant',
        'On Thursday at one, you have a video call with the accountant about the tax return.',
      ],
      [
        'lighthouse',
        "On Thursday evening, the book club meets at Sam's flat to talk about the lighthouse novel.",
      ],
      ['booster', 'On Friday morning, the vet gives the cat its booster at half past nine.'],
      [
        'florist',
        "On Friday at noon, the florist delivers the flowers for your mother's birthday.",
      ],
      [
        'jazz',
        'On Friday evening, you have two tickets for the jazz concert at the river theatre.',
      ],
      ['market', 'On Saturday morning, the farmers market opens at eight in the square.'],
      [
        'swimming',
        'On Saturday at eleven, your nephew has a swimming lesson at the leisure centre.',
      ],
      ['barbecue', 'On Saturday afternoon, the neighbours hold a barbecue in the shared garden.'],
      ['bakery', 'On Sunday morning, the bakery takes your order for the anniversary cake.'],
      ['lisbon', 'On Sunday at two, you said you would phone your aunt in Lisbon.'],
      ['kettle', 'On Sunday evening, the parcel with the new kettle is due between six and eight.'],
      ['window', 'The window cleaner comes next Monday, so the side gate needs to stay unlocked.'],
      ['gym', 'The gym membership renews on the first of next month at twenty-eight pounds.'],
      [
        'passport',
        'The passport renewal form still needs a signed photo before it goes in the post.',
      ],
      [
        'hairdresser',
        'Next Tuesday at four, the hairdresser has you booked for a trim on the high street.',
      ],
      ['pharmacy', 'The pharmacy has your repeat prescription ready to collect from tomorrow.'],
      ['broadband', 'The broadband engineer comes next Wednesday between one and five.'],
      ['tyres', 'The car needs new front tyres before the long drive at the end of the month.'],
      ['raffle', 'The school raffle tickets cost two pounds each, and the draw is next Friday.'],
      ['allotment', 'The allotment rent of forty pounds is due by the end of the month.'],
      ['insurance', 'The insurance letter says the home cover now includes accidental damage.'],
    ] as const;

    const answeredAtMs = performance.now();

    await ctx.speech.answer(
      ctx.sessionID,
      ctx.handOff.handOffID,
      facts.map(([, sentence]) => sentence).join(' '),
      true,
    );

    // The wait ends at the last marker, or after 15 s of quiet, so an answer that stops early fails
    // on the markers it left out and not on the time limit.
    await waitForCondition(
      () =>
        ctx.readSpoken().includes('insurance') ||
        performance.now() - Math.max(answeredAtMs, ctx.readLastSpokenAtMs()) > 15_000,
      { timeoutMs: 280_000, intervalMs: 500 },
    );

    const spoken = ctx.readSpoken();
    const positions = facts.map(([marker]) => spoken.indexOf(marker));

    expect(facts.filter((_, index) => positions[index] === -1)).toStrictEqual([]);
    expect(positions).toStrictEqual(positions.toSorted((left, right) => left - right));
    expect(ctx.received.filter((event) => event.type === 'error')).toStrictEqual([]);

    expect(
      ctx.received
        .filter((event) => event.type === 'session.commentary.appended')
        .map((event) => event.client_event_id?.replace(/^answer_\d+\./u, 'answer.')),
    ).toStrictEqual([
      'answer.0',
      'answer.1',
      'answer.2',
      'answer.3',
      'answer.4',
      'answer.5',
      'answer.6',
    ]);
  },
  300_000,
);
