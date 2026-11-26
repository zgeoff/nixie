import { expect, onTestFinished, test } from 'bun:test';
import { createTestClient } from '@heynixie/server/test-utils';
import type { ScriptedModelRequest } from '@heynixie/testing';
import {
  buildFakeMicrophoneScript,
  buildLoopbackPeerScript,
  setupSignedInBrowser,
  waitForPage,
} from '@heynixie/web/test-utils';
import { z } from 'zod';
import { isConversationTurn } from '../src/test-utils/is-conversation-turn';
import { startWebJourney } from '../src/test-utils/start-web-journey';

type ScriptedBody = NonNullable<ScriptedModelRequest['body']>;

async function setupTest(answer: 'allow' | 'block' = 'allow') {
  const journey = await startWebJourney({
    voicePricePerMinute: 0.05,
    headScript: `${buildFakeMicrophoneScript({ answer })}\n${buildLoopbackPeerScript()}`,
  });

  const api = await createTestClient(journey.server);

  await setupSignedInBrowser(journey.view, { appURL: journey.appURL, token: api.token });

  // the conversation wakes on each of the call's records, each time with a turn of its own
  journey.nixie.model.addReplies(
    ...Array.from({ length: 8 }, () => ({
      text: 'Noted.',
      when: (body: ScriptedBody) => isConversationTurn(body),
    })),
  );

  return {
    ...journey,
    api,
    isCallTurn: (body: ScriptedBody) => !isConversationTurn(body) && (body.tools?.length ?? 0) > 0,
    startCall: async () => {
      await journey.view.navigate(`${journey.appURL}/call`);

      await waitForPage(
        journey.view,
        'document.querySelector(\'button[name="start-call"]:not([disabled])\') !== null',
      );

      await journey.view.click('button[name="start-call"]');
    },

    // A second device of the same user, on its own page of its own host name, because the browser's
    // views share one cookie jar per host. Its observer is in place before the page loads.
    openSecondDevice: async () => {
      const code = await api.client.sessions.issueCode({
        clientActionID: crypto.randomUUID(),
        scope: 'full',
      });

      const second = await api.signedOut.sessions.enrol({
        clientActionID: crypto.randomUUID(),
        code: code.code,
        deviceName: 'tablet',
        tokenDelivery: 'bearer',
      });

      const otherURL = new URL(journey.appURL);

      otherURL.hostname = 'localhost';

      const other = new Bun.WebView({ backend: 'chrome' });

      onTestFinished(() => {
        other.close();
      });

      await other.navigate('about:blank');

      await setupSignedInBrowser(other, { appURL: otherURL.origin, token: second.token ?? '' });

      await other.navigate(`${otherURL.origin}/call`);

      await waitForPage(
        other,
        'document.querySelector(\'button[name="start-call"]:not([disabled])\') !== null',
      );

      return other;
    },
    waitForConnected: () =>
      waitForPage(
        journey.view,
        "document.querySelector('[role=status]')?.textContent === 'Connected'",
        8000,
      ),
  };
}

test('it starts a call from the call screen, connects it over WebRTC with echo cancellation on, and hangs it up as the user', async () => {
  const ctx = await setupTest();

  await ctx.startCall();
  await ctx.waitForConnected();

  const requests: unknown = await ctx.view.evaluate('window.microphoneRequests');
  const speech = await ctx.server.request('readSpeechCalls', null);

  const speechMethods = z
    .array(z.object({ method: z.string() }))
    .parse(speech)
    .map((call) => call.method);

  await ctx.view.click('button[name="hang-up"]');

  await waitForPage(ctx.view, "document.body.innerText.includes('You hung up.')");

  const ended = await ctx.nixie.waitForRecord((record) => record.kind === 'call.ended');

  expect({
    requests,
    speechMethods,
    endedBy: ended.payload['endedBy'],
  }).toStrictEqual({
    requests: [
      '{"audio":{"echoCancellation":true,"noiseSuppression":true,"autoGainControl":true}}',
    ],
    speechMethods: ['open'],
    endedBy: 'you',
  });
});

test('it tells a user who blocked the microphone how to allow it, and starts no call', async () => {
  const ctx = await setupTest('block');

  await ctx.startCall();

  await waitForPage(ctx.view, "document.body.innerText.includes('Allow it for this site')");

  const records = await ctx.nixie.readRecords();

  expect(records.filter((record) => record.kind === 'call.started')).toHaveLength(0);
});

test('it keeps the call live across a route change, shows the call bar on each route, and goes back to the call from it', async () => {
  const ctx = await setupTest();

  await ctx.startCall();
  await ctx.waitForConnected();

  // a click on a link changes the route in the page, which a new page load would not
  await ctx.view.evaluate('document.querySelector(\'nav a[href="/tasks"]\').click()');

  await waitForPage(
    ctx.view,
    'document.querySelector(\'[aria-label="Call in progress"]\') !== null',
    8000,
  );

  await ctx.view.click('[aria-label="Call in progress"] a');

  await waitForPage(
    ctx.view,
    'document.querySelector(\'[aria-label="Call in progress"]\') === null',
  );

  const status: unknown = await ctx.view.evaluate(
    "document.querySelector('[role=status]').textContent",
  );

  const records = await ctx.nixie.readRecords();

  expect([status, records.filter((record) => record.kind === 'call.ended')]).toStrictEqual([
    'Connected',
    [],
  ]);
});

test('it shows the card of a proposal made during the call on the carrying device only, and routes it to that device alone', async () => {
  const ctx = await setupTest();

  ctx.nixie.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__memory_remember',
        input: {
          text: 'The user keeps bees on the allotment.',
          gist: 'keeps bees',
          topic: 'allotment',
        },
      },
      when: (body) => ctx.isCallTurn(body),
    },
    { text: 'I will ask you before I remember that.', when: (body) => ctx.isCallTurn(body) },
  );

  await ctx.startCall();
  await ctx.waitForConnected();

  const other = await ctx.openSecondDevice();

  await ctx.server.request('emitSpeech', {
    sessionID: 'fake-session-1',
    event: { kind: 'hand_off', handOffID: 'h1', request: 'remember my bees' },
  });

  await waitForPage(
    ctx.view,
    "document.querySelector('[aria-label=\"Proposals from this call\"]')?.innerText.includes('The user keeps bees on the allotment.') === true",
    8000,
  );

  const otherShowsCard: unknown = await other.evaluate(
    `document.querySelector('[aria-label="Proposals from this call"]') !== null`,
  );

  const started = await ctx.nixie.waitForRecord((record) => record.kind === 'call.started');
  const listed = await ctx.api.client.sessions.list();

  const carrying = listed.sessions.find((session) => session.current);
  const tablet = listed.sessions.find((session) => session.deviceName === 'tablet');

  const records = await ctx.nixie.readRecords();

  // the server names the carrying device on the call and puts the proposal on the call's own task
  // thread, and no record names the other device
  expect({
    otherShowsCard,
    carryingSession: started.payload['carryingSession'] === carrying?.sessionID,
    proposalOnCallThread: records.some(
      (record) => record.thread === started.payload['taskID'] && record.kind.includes('proposal'),
    ),
    namesOtherDevice: records
      .filter(
        (record) => record.kind.startsWith('call.') || record.thread === started.payload['taskID'],
      )
      .some((record) => JSON.stringify(record).includes(tablet?.sessionID ?? 'no-such-session')),
  }).toStrictEqual({
    otherShowsCard: false,
    carryingSession: true,
    proposalOnCallThread: true,
    namesOtherDevice: false,
  });
});

test('it keeps the call live on the device route, which has no app shell, and shows the call bar there', async () => {
  const ctx = await setupTest();

  await ctx.startCall();
  await ctx.waitForConnected();

  // the router client-side navigates, which a new page load would not
  await ctx.view.evaluate("window.__TSR_ROUTER__.navigate({ to: '/device' })");

  await waitForPage(
    ctx.view,
    "location.pathname === '/device' && document.querySelector('[aria-label=\"Call in progress\"]') !== null",
    8000,
  );

  await ctx.view.evaluate("window.__TSR_ROUTER__.navigate({ to: '/call' })");
  await ctx.waitForConnected();

  const records = await ctx.nixie.readRecords();

  expect(records.filter((record) => record.kind === 'call.ended')).toStrictEqual([]);
});

test('it reconnects the call with an ICE-restart offer and a fresh connect within 30 s after a server restart', async () => {
  const ctx = await setupTest();

  await ctx.startCall();
  await ctx.waitForConnected();
  await ctx.server.kill();

  const restartedAtMs = performance.now();

  await ctx.startServer();
  await ctx.nixie.waitForRecord((record) => record.kind === 'call.reconnected');

  await waitForPage(
    ctx.view,
    "document.querySelector('[role=status]')?.textContent === 'Connected'",
    30_000,
  );

  const reconnectedInMs = performance.now() - restartedAtMs;

  const records = await ctx.nixie.readRecords();

  expect({
    isWithinLimit: reconnectedInMs < 30_000,
    reconnected: records
      .filter((record) => record.kind === 'call.reconnected')
      .map((record) => record.payload['cause']),
    ended: records.filter((record) => record.kind === 'call.ended'),
  }).toStrictEqual({ isWithinLimit: true, reconnected: ['restart'], ended: [] });
});
