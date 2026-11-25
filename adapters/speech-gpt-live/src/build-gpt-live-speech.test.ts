import { expect, test } from 'bun:test';
import type { SpeechEvent } from '@heynixie/calls';
import { startTestSite } from '@heynixie/egress/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { createFakeClock, runClockUntil } from '@zgeoff/testing/clock';
import { z } from 'zod';
import { buildGPTLiveSpeech } from './build-gpt-live-speech';
import { buildTestFetcher } from './test-utils/build-test-fetcher';
import type { SidebandInit } from './types';

async function setupTest() {
  const createBodies: unknown[] = [];

  // what the fake provider does with the next requests, which a test changes before it opens
  const provider = { createStatus: 201, isSocketRefused: false, isSocketSilent: false };
  const clientEvents: Record<string, unknown>[] = [];

  const site = await startTestSite({
    names: ['localhost'],
    respond: async (request) => {
      if (request.method !== 'POST') {
        return new Response('not a socket');
      }

      const body: unknown = await request.json();

      createBodies.push(body);

      if (provider.createStatus !== 201) {
        return new Response('{}', { status: provider.createStatus });
      }

      return Response.json(
        { session: { id: 'sess_live_1' }, transport: { sdp: 'answer-sdp' } },
        { status: 201 },
      );
    },
    socket: {
      shouldUpgrade: () => !provider.isSocketRefused,
      onMessage: (_connection, text) => {
        clientEvents.push(z.record(z.string(), z.unknown()).parse(JSON.parse(text)));
      },
    },
  });

  const origin = `https://localhost:${String(site.port)}`;
  const siteFetcher = buildTestFetcher(site.ca);

  // A silent site takes the connection and never answers the upgrade, so its open ends only when
  // the adapter aborts it.
  const fetcher = Object.assign((input: string, init?: RequestInit) => siteFetcher(input, init), {
    openSocket: (url: string, init?: SidebandInit) =>
      provider.isSocketSilent
        ? new Promise<never>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new Error('the open was aborted'));
            });
          })
        : siteFetcher.openSocket(url, init),
  });

  const clock = createFakeClock({ startMs: 1_800_000_000_000 });
  const logged: { event: string; fields: unknown }[] = [];

  const speech = buildGPTLiveSpeech({
    fetch: fetcher,
    apiURL: origin,
    model: 'gpt-live-test-1',
    clock,
    logEvent: (event, fields) => {
      logged.push({ event, fields });
    },
  });

  // Opens a session and reads its events into a list, as the calls module's watch does.
  const openSession = async () => {
    const opened = await speech.open({
      sdpOffer: 'offer-sdp',
      instructions: 'Hand every request to the assistant.',
      voice: 'marin',
    });

    if ('error' in opened) {
      throw new Error(opened.error);
    }

    const events: SpeechEvent[] = [];

    void (async () => {
      for await (const event of speech.events(opened.sessionID)) {
        events.push(event);
      }
    })();

    await waitForCondition(() => site.connections.length === 1);

    return { opened, events };
  };

  // What the provider sends down the sideband.
  const emit = (event: Record<string, unknown>) => {
    site.connections[0]?.send(JSON.stringify(event));
  };

  return {
    site,
    fetcher,
    clock,
    speech,
    logged,
    provider,
    createBodies,
    clientEvents,
    openSession,
    emit,
  };
}

test('it creates the session from the device offer, and joins it on the sideband', async () => {
  const ctx = await setupTest();

  const opened = await ctx.speech.open({
    sdpOffer: 'offer-sdp',
    instructions: 'Hand every request to the assistant.',
    voice: 'marin',
  });

  expect(opened).toStrictEqual({ sdpAnswer: 'answer-sdp', sessionID: 'sess_live_1' });

  expect(ctx.createBodies).toStrictEqual([
    {
      session: {
        model: 'gpt-live-test-1',
        instructions: 'Hand every request to the assistant.',
        audio: { output: { voice: 'marin' } },
        delegation: { type: 'client', acknowledgement_delay_ms: 800 },
        store: false,
        client: { data_channel: { allowed_client_events: [], allowed_server_events: [] } },
      },
      transport: { type: 'webrtc', sdp: 'offer-sdp' },
    },
  ]);

  expect(ctx.site.requests.map((request) => request.url)).toStrictEqual([
    `https://localhost:${String(ctx.site.port)}/v1/live/sessions`,
    `https://localhost:${String(ctx.site.port)}/v1/live/sessions/sess_live_1/attach`,
  ]);
});

test('it sends no credential of its own to the create request or the sideband', async () => {
  const ctx = await setupTest();

  await ctx.openSession();

  expect(ctx.site.requests.map((request) => request.headers['authorization'])).toStrictEqual([
    undefined,
    undefined,
  ]);
});

test('it names the provider model on the layer', async () => {
  const ctx = await setupTest();

  expect(ctx.speech.model).toBe('gpt-live-test-1');
});

test.each<[number, 'VOICE_CREDENTIAL_REFUSED' | 'SPEECH_UNAVAILABLE']>([
  [401, 'VOICE_CREDENTIAL_REFUSED'],
  [403, 'VOICE_CREDENTIAL_REFUSED'],
  [500, 'SPEECH_UNAVAILABLE'],
  [400, 'SPEECH_UNAVAILABLE'],
])('it refuses an open that the provider answers with %s as %s', async (status, error) => {
  const ctx = await setupTest();

  ctx.provider.createStatus = status;

  const opened = await ctx.speech.open({ sdpOffer: 'offer-sdp', instructions: 'x', voice: 'v' });

  expect(opened).toStrictEqual({ error });
});

test('it refuses an open whose sideband the site does not upgrade', async () => {
  const ctx = await setupTest();

  ctx.provider.isSocketRefused = true;

  const opened = await ctx.speech.open({ sdpOffer: 'offer-sdp', instructions: 'x', voice: 'v' });

  expect(opened).toStrictEqual({ error: 'SPEECH_UNAVAILABLE' });
});

test('it refuses an open whose sideband never answers the upgrade, once the open limit passes', async () => {
  const ctx = await setupTest();

  ctx.provider.isSocketSilent = true;

  const opening = ctx.speech.open({ sdpOffer: 'offer-sdp', instructions: 'x', voice: 'v' });

  await waitForCondition(() => ctx.clock.countPending() > 0);

  ctx.clock.advance(15_000);

  const opened = await opening;

  expect(opened).toStrictEqual({ error: 'SPEECH_UNAVAILABLE' });

  expect(ctx.logged).toStrictEqual([
    {
      event: 'calls.speech_attach_failed',
      fields: { sessionID: 'sess_live_1', reason: 'the open was aborted' },
    },
  ]);
});

test('it turns the speech up to a delegation into a heard line and a hand-off, and holds the speech layer silent', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  ctx.emit({
    type: 'session.input_transcript.delta',
    delta: " What's on",
    start_ms: 10_800,
    end_ms: 11_000,
  });

  ctx.emit({
    type: 'session.input_transcript.delta',
    delta: ' tomorrow',
    start_ms: 11_400,
    end_ms: 11_600,
  });

  ctx.emit({
    type: 'session.input_transcript.delta',
    delta: ' morning',
    start_ms: 12_000,
    end_ms: 12_200,
  });

  ctx.emit({
    type: 'session.delegation.created',
    offset_ms: 12_000,
    delegation: { id: 'item_a1' },
  });

  await waitForCondition(() => session.events.length === 2);

  expect(session.events).toStrictEqual([
    { kind: 'heard', text: "What's on tomorrow morning", startedAtMs: 10_800, endedAtMs: 12_200 },
    { kind: 'hand_off', handOffID: 'item_a1', request: "What's on tomorrow morning" },
  ]);

  await waitForCondition(() => ctx.clientEvents.length === 1);

  expect(ctx.clientEvents).toStrictEqual([
    {
      type: 'session.thinking.append',
      event_id: 'thinking_1',
      delegation_id: 'item_a1',
      content: '',
    },
  ]);
});

test('it keeps the speech after a delegation offset for the next hand-off', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  ctx.emit({
    type: 'session.input_transcript.delta',
    delta: ' First',
    start_ms: 1000,
    end_ms: 1200,
  });

  ctx.emit({
    type: 'session.input_transcript.delta',
    delta: ' second',
    start_ms: 3000,
    end_ms: 3200,
  });

  ctx.emit({ type: 'session.delegation.created', offset_ms: 1400, delegation: { id: 'item_a1' } });
  ctx.emit({ type: 'session.delegation.created', offset_ms: 3600, delegation: { id: 'item_a2' } });

  await waitForCondition(() => session.events.length === 4);

  expect(session.events.filter((event) => event.kind === 'hand_off')).toStrictEqual([
    { kind: 'hand_off', handOffID: 'item_a1', request: 'First' },
    { kind: 'hand_off', handOffID: 'item_a2', request: 'second' },
  ]);
});

test('it ends a heard line after a second of quiet', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  ctx.emit({
    type: 'session.input_transcript.delta',
    delta: ' Hi there',
    start_ms: 500,
    end_ms: 900,
  });

  await waitForCondition(() => ctx.clock.countPending() > 1);

  ctx.clock.advance(1000);

  await waitForCondition(() => session.events.length === 1);

  expect(session.events).toStrictEqual([
    { kind: 'heard', text: 'Hi there', startedAtMs: 500, endedAtMs: 900 },
  ]);
});

test('it turns the speech layer own speech into a spoke line, whole once it goes quiet', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  ctx.emit({
    type: 'session.output_transcript.delta',
    delta: 'Hello!',
    start_ms: 100,
    end_ms: 400,
  });

  ctx.emit({
    type: 'session.output_transcript.delta',
    delta: ' How are you?',
    start_ms: 400,
    end_ms: 900,
  });

  await waitForCondition(() => ctx.clock.countPending() > 1);

  ctx.clock.advance(1000);

  await waitForCondition(() => session.events.length === 1);

  expect(session.events).toStrictEqual([
    { kind: 'spoke', text: 'Hello! How are you?', heardChars: 19 },
  ]);
});

test('it sends nixie answer as one commentary on the delegation', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  await ctx.speech.answer(
    session.opened.sessionID,
    'item_a1',
    'You have two things. A dentist at nine.',
    true,
  );

  await waitForCondition(() => ctx.clientEvents.length === 1);

  expect(ctx.clientEvents).toStrictEqual([
    {
      type: 'session.commentary.append',
      event_id: 'answer_1.0',
      delegation_id: 'item_a1',
      content: 'You have two things. A dentist at nine.',
    },
  ]);
});

test('it splits an answer past the provider limit into parts on the same delegation', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  const text = 'The plumber comes on Monday. '.repeat(100).trim();

  await ctx.speech.answer(session.opened.sessionID, 'item_a1', text, true);

  await waitForCondition(() => ctx.clientEvents.length >= 3);

  expect(ctx.clientEvents).toSatisfyAll(
    (event: Record<string, unknown>) =>
      event['type'] === 'session.commentary.append' &&
      event['delegation_id'] === 'item_a1' &&
      String(event['content']).length <= 1200,
  );

  expect(ctx.clientEvents.map((event) => event['content']).join(' ')).toBe(text);
});

test('it sends a line to say now as a commentary with no delegation', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  await ctx.speech.say(session.opened.sessionID, 'One moment.');

  await waitForCondition(() => ctx.clientEvents.length === 1);

  expect(ctx.clientEvents).toStrictEqual([
    {
      type: 'session.commentary.append',
      event_id: 'say_1.0',
      delegation_id: null,
      content: 'One moment.',
    },
  ]);
});

test('it raises no spoke line for the holding line or the answer it speaks', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  await ctx.speech.say(session.opened.sessionID, 'One moment.');

  await waitForCondition(() => ctx.clientEvents.length === 1);

  ctx.emit({
    type: 'session.commentary.appended',
    client_event_id: 'say_1.0',
    start_ms: 2000,
    end_ms: 2200,
  });

  ctx.emit({
    type: 'session.output_transcript.delta',
    delta: 'One moment.',
    start_ms: 2000,
    end_ms: 2600,
  });

  await waitForCondition(() => ctx.clock.countPending() > 1);

  ctx.clock.advance(1000);

  await ctx.speech.answer(session.opened.sessionID, 'item_a1', 'You have a dentist at nine.', true);

  await waitForCondition(() => ctx.clientEvents.length === 2);

  ctx.emit({
    type: 'session.commentary.appended',
    client_event_id: 'answer_2.0',
    start_ms: 6000,
    end_ms: 6200,
  });

  ctx.emit({
    type: 'session.output_transcript.delta',
    delta: 'You have a dentist at nine.',
    start_ms: 6000,
    end_ms: 7500,
  });

  await waitForCondition(() => ctx.clock.countPending() > 1);

  ctx.clock.advance(1000);

  // a marker event that follows the speech on the stream shows that no spoke line came before it
  ctx.emit({ type: 'session.closed', reason: 'expired' });

  await waitForCondition(() => session.events.length === 1);

  expect(session.events).toStrictEqual([{ kind: 'dropped' }]);
});

test('it raises a cut with the characters heard when the user talks over an answer', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  const answer =
    'This week you have four things. On Monday, the plumber comes between eight and ten.';

  await ctx.speech.answer(session.opened.sessionID, 'item_a1', answer, true);

  await waitForCondition(() => ctx.clientEvents.length === 1);

  ctx.emit({
    type: 'session.commentary.appended',
    client_event_id: 'answer_1.0',
    start_ms: 5000,
    end_ms: 5200,
  });

  ctx.emit({
    type: 'session.output_transcript.delta',
    delta: "You've got four things this week.",
    start_ms: 5000,
    end_ms: 7000,
  });

  ctx.emit({
    type: 'session.output_transcript.delta',
    delta: ' On Monday,',
    start_ms: 7000,
    end_ms: 8000,
  });

  ctx.emit({
    type: 'session.output_transcript.delta',
    delta: ' the plumber',
    start_ms: 9000,
    end_ms: 9500,
  });

  ctx.emit({
    type: 'session.input_transcript.delta',
    delta: ' Sorry',
    start_ms: 8200,
    end_ms: 8400,
  });

  await waitForCondition(() => ctx.clock.countPending() > 2);

  ctx.clock.advance(500);

  await waitForCondition(() => session.events.some((event) => event.kind === 'cut'));

  expect(session.events.filter((event) => event.kind === 'cut')).toStrictEqual([
    { kind: 'cut', handOffID: 'item_a1', heardChars: 41 },
  ]);
});

test('it raises one cut for a user who keeps talking over an answer', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  await ctx.speech.answer(
    session.opened.sessionID,
    'item_a1',
    'You have a dentist at nine and a call at eleven.',
    true,
  );

  await waitForCondition(() => ctx.clientEvents.length === 1);

  ctx.emit({
    type: 'session.commentary.appended',
    client_event_id: 'answer_1.0',
    start_ms: 5000,
    end_ms: 5200,
  });

  ctx.emit({
    type: 'session.output_transcript.delta',
    delta: 'You have a dentist',
    start_ms: 5000,
    end_ms: 6000,
  });

  ctx.emit({
    type: 'session.input_transcript.delta',
    delta: ' Wait',
    start_ms: 6200,
    end_ms: 6400,
  });

  ctx.emit({
    type: 'session.input_transcript.delta',
    delta: ' stop',
    start_ms: 6600,
    end_ms: 6800,
  });

  await waitForCondition(() => ctx.clock.countPending() > 2);

  ctx.clock.advance(500);

  await waitForCondition(() => session.events.some((event) => event.kind === 'cut'));

  ctx.clock.advance(2000);

  await waitForCondition(() => session.events.some((event) => event.kind === 'heard'));

  expect(session.events.filter((event) => event.kind === 'cut')).toHaveLength(1);
});

test('it raises no cut for speech after the answer has finished', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  await ctx.speech.answer(session.opened.sessionID, 'item_a1', 'You have a dentist at nine.', true);

  await waitForCondition(() => ctx.clientEvents.length === 1);

  ctx.emit({
    type: 'session.commentary.appended',
    client_event_id: 'answer_1.0',
    start_ms: 5000,
    end_ms: 5200,
  });

  ctx.emit({
    type: 'session.output_transcript.delta',
    delta: 'You have a dentist at nine.',
    start_ms: 5000,
    end_ms: 6500,
  });

  await waitForCondition(() => ctx.clock.countPending() > 1);

  ctx.clock.advance(1000);

  ctx.emit({
    type: 'session.input_transcript.delta',
    delta: ' Thanks',
    start_ms: 9000,
    end_ms: 9200,
  });

  await waitForCondition(() => ctx.clock.countPending() > 1);

  ctx.clock.advance(1000);

  await waitForCondition(() => session.events.some((event) => event.kind === 'heard'));

  expect(session.events.map((event) => event.kind)).toStrictEqual(['heard']);
});

test('it counts the speech that arrives after the interruption, inside the settle wait', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  await ctx.speech.answer(session.opened.sessionID, 'item_a1', 'One two', true);

  await waitForCondition(() => ctx.clientEvents.length === 1);

  ctx.emit({
    type: 'session.commentary.appended',
    client_event_id: 'answer_1.0',
    start_ms: 5000,
    end_ms: 5200,
  });

  ctx.emit({
    type: 'session.input_transcript.delta',
    delta: ' Stop',
    start_ms: 8000,
    end_ms: 8200,
  });

  ctx.emit({
    type: 'session.output_transcript.delta',
    delta: 'One two',
    start_ms: 5000,
    end_ms: 7000,
  });

  await waitForCondition(() => ctx.clock.countPending() > 2);

  ctx.clock.advance(500);

  await waitForCondition(() => session.events.some((event) => event.kind === 'cut'));

  expect(session.events.filter((event) => event.kind === 'cut')).toStrictEqual([
    { kind: 'cut', handOffID: 'item_a1', heardChars: 7 },
  ]);
});

test('it counts the speech that arrives after the output goes quiet, inside the settle wait', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  await ctx.speech.answer(session.opened.sessionID, 'item_a1', 'One two', true);

  await waitForCondition(() => ctx.clientEvents.length === 1);

  ctx.emit({
    type: 'session.commentary.appended',
    client_event_id: 'answer_1.0',
    start_ms: 5000,
    end_ms: 5200,
  });

  await waitForCondition(() => ctx.clock.countPending() === 2);

  ctx.clock.advance(600);

  ctx.emit({
    type: 'session.input_transcript.delta',
    delta: ' Stop',
    start_ms: 8000,
    end_ms: 8200,
  });

  await waitForCondition(() => ctx.clock.countPending() === 4);

  // the quiet timer of the output ends here, 100 ms before the settle wait does
  ctx.clock.advance(400);

  await waitForCondition(() => ctx.clock.countPending() === 3);

  ctx.emit({
    type: 'session.output_transcript.delta',
    delta: 'One two',
    start_ms: 5000,
    end_ms: 6000,
  });

  await waitForCondition(() => ctx.clock.countPending() === 4);

  ctx.clock.advance(100);

  await waitForCondition(() => session.events.some((event) => event.kind === 'cut'));

  expect(session.events.filter((event) => event.kind === 'cut')).toStrictEqual([
    { kind: 'cut', handOffID: 'item_a1', heardChars: 7 },
  ]);

  expect(session.events.filter((event) => event.kind === 'spoke')).toStrictEqual([]);
});

test('it records no spoke line for the second part of an answer after a gap between the parts', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  const sentence = `${'word '.repeat(60).trim()}. `;

  await ctx.speech.answer(session.opened.sessionID, 'item_a1', sentence.repeat(2).trim(), true);

  await waitForCondition(() => ctx.clientEvents.length === 2);

  ctx.emit({
    type: 'session.commentary.appended',
    client_event_id: 'answer_1.0',
    start_ms: 5000,
    end_ms: 5200,
  });

  ctx.emit({
    type: 'session.output_transcript.delta',
    delta: 'Part one.',
    start_ms: 5000,
    end_ms: 6000,
  });

  await waitForCondition(() => ctx.clock.countPending() > 1);

  ctx.clock.advance(1000);

  ctx.emit({
    type: 'session.commentary.appended',
    client_event_id: 'answer_1.1',
    start_ms: 20_000,
    end_ms: 20_200,
  });

  ctx.emit({
    type: 'session.output_transcript.delta',
    delta: 'One two',
    start_ms: 20_000,
    end_ms: 21_000,
  });

  await waitForCondition(() => ctx.clock.countPending() > 1);

  ctx.clock.advance(1000);

  ctx.emit({
    type: 'session.input_transcript.delta',
    delta: ' Ok',
    start_ms: 40_000,
    end_ms: 40_100,
  });

  await waitForCondition(() => ctx.clock.countPending() > 1);

  ctx.clock.advance(1000);

  await waitForCondition(() => session.events.some((event) => event.kind === 'heard'));

  expect(session.events.map((event) => event.kind)).toStrictEqual(['heard']);
});

test('it closes without the full wait when the provider refuses a later part of an answer', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  const sentence = `${'word '.repeat(60).trim()}. `;

  await ctx.speech.answer(session.opened.sessionID, 'item_a1', sentence.repeat(2).trim(), true);

  await waitForCondition(() => ctx.clientEvents.length === 2);

  ctx.emit({
    type: 'session.commentary.appended',
    client_event_id: 'answer_1.0',
    start_ms: 5000,
    end_ms: 5200,
  });

  ctx.emit({
    type: 'error',
    error: { type: 'invalid_request_error', message: 'Too long.', client_event_id: 'answer_1.1' },
  });

  await waitForCondition(() => ctx.logged.length === 1);

  const closing = ctx.speech.close(session.opened.sessionID);

  await waitForCondition(() => ctx.clock.countPending() > 0);
  await runClockUntil(ctx.clock, () => ctx.clientEvents.length === 3, { maxMs: 10_000 });

  expect(ctx.clientEvents[2]).toStrictEqual({ type: 'session.close' });

  ctx.emit({ type: 'session.closed', reason: 'closed' });

  await closing;
});

test('it splits a long line to say into parts with no delegation', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  const text = 'The plumber comes on Monday. '.repeat(100).trim();

  await ctx.speech.say(session.opened.sessionID, text);

  await waitForCondition(() => ctx.clientEvents.length >= 3);

  expect(ctx.clientEvents).toSatisfyAll(
    (event: Record<string, unknown>) =>
      event['type'] === 'session.commentary.append' && event['delegation_id'] === null,
  );

  expect(ctx.clientEvents.map((event) => event['content']).join(' ')).toBe(text);
});

test('it warns of the session limit 5 minutes before the expiry the session reports', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  const expiresAtMs = ctx.clock.now() + 60 * 60 * 1000;

  // the provider reports the expiry in epoch seconds
  ctx.emit({
    type: 'session.started',
    event_id: 'evt_started',
    session: { expires_at: expiresAtMs / 1000 },
  });

  await waitForCondition(() => ctx.clock.readNextDueMs() === expiresAtMs - 5 * 60 * 1000);

  ctx.clock.advance(55 * 60 * 1000 - 1);

  expect(session.events).toStrictEqual([]);

  ctx.clock.advance(1);

  await waitForCondition(() => session.events.length === 1);

  expect(session.events).toStrictEqual([{ kind: 'session_ending' }]);
});

test('it warns of the session limit 5 minutes before the standard limit when the session reports none', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  ctx.clock.advance(2 * 60 * 60 * 1000 - 5 * 60 * 1000);

  await waitForCondition(() => session.events.length === 1);

  expect(session.events).toStrictEqual([{ kind: 'session_ending' }]);
});

test('it logs a provider error and keeps reading the session', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  await ctx.speech.answer(
    session.opened.sessionID,
    'item_gone',
    'You have a dentist at nine.',
    true,
  );

  await waitForCondition(() => ctx.clientEvents.length === 1);

  ctx.emit({
    type: 'error',
    error: {
      type: 'invalid_request_error',
      message: 'Unknown client or Decision delegation.',
      param: 'delegation_id',
      client_event_id: 'answer_1.0',
    },
  });

  ctx.emit({ type: 'session.input_transcript.delta', delta: ' Hello', start_ms: 100, end_ms: 300 });
  ctx.emit({ type: 'session.delegation.created', offset_ms: 400, delegation: { id: 'item_b1' } });

  await waitForCondition(() => session.events.length === 2);

  expect(ctx.logged).toStrictEqual([
    {
      event: 'calls.speech_provider_error',
      fields: {
        sessionID: 'sess_live_1',
        type: 'invalid_request_error',
        param: 'delegation_id',
        message: 'Unknown client or Decision delegation.',
      },
    },
  ]);

  expect(session.events.map((event) => event.kind)).toStrictEqual(['heard', 'hand_off']);
});

test('it raises dropped when the provider closes the session', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  ctx.emit({ type: 'session.closed', reason: 'expired' });

  await waitForCondition(() => session.events.length === 1);

  expect(session.events).toStrictEqual([{ kind: 'dropped' }]);
});

test('it raises dropped when the sideband ends with no close asked for', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  ctx.site.connections[0]?.close();

  await waitForCondition(() => session.events.length === 1);

  expect(session.events).toStrictEqual([{ kind: 'dropped' }]);
});

test('it reads an event that the provider replays once', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  ctx.emit({
    type: 'session.input_transcript.delta',
    event_id: 'evt_1',
    delta: ' Hi',
    start_ms: 100,
    end_ms: 300,
  });

  ctx.emit({
    type: 'session.input_transcript.delta',
    event_id: 'evt_1',
    delta: ' Hi',
    start_ms: 100,
    end_ms: 300,
  });

  ctx.emit({ type: 'session.delegation.created', offset_ms: 400, delegation: { id: 'item_a1' } });

  await waitForCondition(() => session.events.length === 2);

  expect(session.events[1]).toStrictEqual({
    kind: 'hand_off',
    handOffID: 'item_a1',
    request: 'Hi',
  });
});

test('it closes the session once the speech layer has finished the line it is speaking', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  await ctx.speech.answer(session.opened.sessionID, 'item_a1', 'You have a dentist at nine.', true);

  await waitForCondition(() => ctx.clientEvents.length === 1);

  ctx.emit({
    type: 'session.commentary.appended',
    client_event_id: 'answer_1.0',
    start_ms: 5000,
    end_ms: 5200,
  });

  ctx.emit({
    type: 'session.output_transcript.delta',
    delta: 'You have a dentist at nine.',
    start_ms: 5000,
    end_ms: 6500,
  });

  await waitForCondition(() => ctx.clock.countPending() > 1);

  const closing = ctx.speech.close(session.opened.sessionID);

  ctx.clock.advance(400);

  await waitForCondition(() => ctx.clock.countPending() >= 2);

  expect(ctx.clientEvents.map((event) => event['type'])).toStrictEqual([
    'session.commentary.append',
  ]);

  await runClockUntil(ctx.clock, () => ctx.clientEvents.length === 2, { maxMs: 10_000 });

  expect(ctx.clientEvents[1]).toStrictEqual({ type: 'session.close' });

  ctx.emit({ type: 'session.closed', reason: 'closed' });

  await closing;

  expect(session.events).toStrictEqual([]);
});

test('it refuses an answer for a session that is closed', async () => {
  const ctx = await setupTest();
  const session = await ctx.openSession();

  const closing = ctx.speech.close(session.opened.sessionID);

  await waitForCondition(() => ctx.clientEvents.length === 1);

  ctx.emit({ type: 'session.closed', reason: 'closed' });

  await closing;

  expect(ctx.speech.answer(session.opened.sessionID, 'item_a1', 'Too late.', true)).rejects.toThrow(
    'the speech session is closed',
  );
});
