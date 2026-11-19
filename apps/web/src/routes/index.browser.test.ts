import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { runInPage } from '@zgeoff/rig';
import { z } from 'zod';
import { store } from '../mocks/store';
import { buildMockDefinitionNotice } from '../test-utils/build-mock-definition-notice';
import { setBrowserFiles } from '../test-utils/set-browser-files';
import { setupBrowserTimeZone } from '../test-utils/setup-browser-time-zone';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';
import { waitForPage } from '../test-utils/wait-for-page';

async function setupTest() {
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);

  const app = startFrontProxy({ apiURL: api.url, webURL: web.url });

  const answerRequest = () =>
    new Response(`<a id="open" href="${app.url}/">Open nixie</a>`, {
      headers: { 'content-type': 'text/html' },
    });

  // localhost is another site than 127.0.0.1, so a link from this page into the app is a
  // navigation from outside the site, as a launch from the home-screen icon is.
  const elsewhere = Bun.serve({
    fetch: answerRequest,
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(async () => {
    await elsewhere.stop(true);
  });

  const view = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(() => {
    view.close();
  });

  // Bun runs one Chrome for the whole test process, and its views share one cookie jar, so each
  // test starts from an empty one.
  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  return { api, appURL: app.url, elsewhereURL: `http://localhost:${elsewhere.port}/`, view };
}

test('it renders the conversation signed in when a link from another site opens the app', async () => {
  const ctx = await setupTest();

  const [code] = await Promise.all([
    store.enrolmentCodes.create({}),
    store.records.create({ kind: 'owner_message', message: { text: 'Is the kettle on?' } }),
  ]);

  await ctx.view.navigate(`${ctx.appURL}/`);

  await runInPage(
    ctx.view,
    async (enrolmentCode: string) => {
      const response = await fetch('/rpc/sessions/enrol', {
        body: JSON.stringify({
          json: {
            clientActionID: '0b7e4f2a-6c1d-4e8b-9a3f-5d2c8e1b7a64',
            code: enrolmentCode,
            deviceName: 'kitchen tablet',
            tokenDelivery: 'cookie',
          },
        }),
        headers: { 'content-type': 'application/json', 'x-nixie-client': 'web' },
        method: 'POST',
      });

      return response.status;
    },
    code.code,
    z.number(),
  );

  await ctx.view.navigate(ctx.elsewhereURL);
  await ctx.view.click('#open');

  await waitFor(
    async () => {
      const text: unknown = await ctx.view.evaluate('document.body.innerText');

      expect(text).toInclude('Is the kettle on?');
    },
    { timeout: 10_000 },
  );

  const session = store.sessions.findFirst((query) =>
    query.where({ deviceName: 'kitchen tablet' }),
  );

  expect(ctx.api.requests.filter((request) => request.authorization !== null)).toStrictEqual([
    { authorization: `Bearer ${session?.token}`, cookie: null, path: '/rpc/conversation/read' },
  ]);
});

test('it checks again in the browser when the server render gets no cookie that the browser holds', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.records.create({ kind: 'owner_message', message: { text: 'Is the kettle on?' } });

  // A browser leaves a Strict cookie off a navigation from another site, so the server renders
  // the page without the session that the browser holds.
  await ctx.view.navigate(ctx.elsewhereURL);

  await ctx.view.cdp('Network.setCookie', {
    httpOnly: true,
    name: 'nixie_session',
    path: '/',
    sameSite: 'Strict',
    secure: true,
    url: `${ctx.appURL}/`,
    value: session.token,
  });

  await ctx.view.click('#open');

  await waitFor(
    async () => {
      const text: unknown = await ctx.view.evaluate('document.body.innerText');

      expect(text).toInclude('Is the kettle on?');
    },
    { timeout: 10_000 },
  );

  expect(ctx.api.requests.slice(0, 2)).toStrictEqual([
    { authorization: null, cookie: null, path: '/rpc/conversation/read' },
    {
      authorization: null,
      cookie: `nixie_session=${session.token}`,
      path: '/rpc/conversation/read',
    },
  ]);
});

test('it sends a photo picked in the browser with the message, then shows it in the thread', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await setBrowserFiles(ctx.view, {
    selector: 'input[type=file][multiple]:enabled',
    files: [
      {
        name: 'swatch.png',
        bytes: Uint8Array.fromBase64(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
        ),
      },
    ],
  });

  await waitFor(
    async () => {
      const attached: unknown = await ctx.view.evaluate(
        'document.querySelector(\'img[alt="Attached image 1"]\') !== null',
      );

      expect(attached).toBeTrue();
    },
    { timeout: 10_000 },
  );

  await ctx.view.click('textarea');
  await ctx.view.cdp('Input.insertText', { text: 'Is this the right shade?' });
  await ctx.view.click('button[type=submit]');

  await waitFor(
    async () => {
      const width: unknown = await ctx.view.evaluate(
        "document.querySelector('[role=status]') === null ? (document.querySelector('img[alt=\"Image 1\"]')?.naturalWidth ?? 0) : 0",
      );

      expect(width).toBe(1);
    },
    { timeout: 10_000 },
  );

  expect(
    store.records.findFirst((query) => query.where({ kind: 'owner_message' }))?.message,
  ).toMatchObject({
    images: [{ data: expect.toBeString(), mediaType: 'image/png' }],
    text: 'Is this the right shade?',
  });
});

test('it shows the enrolment form once the browser finds that it holds no session', async () => {
  const ctx = await setupTest();

  await ctx.view.navigate(ctx.elsewhereURL);
  await ctx.view.click('#open');

  await waitFor(
    async () => {
      const text: unknown = await ctx.view.evaluate('document.body.innerText');

      expect(text).toInclude('Enrol this browser');
    },
    { timeout: 10_000 },
  );

  expect(ctx.api.requests).toStrictEqual([
    { authorization: null, cookie: null, path: '/rpc/conversation/read' },
    { authorization: null, cookie: null, path: '/rpc/conversation/read' },
  ]);
});

test('it opens the conversation at a message that a hop-limit notice links, behind later records', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.tasks.create({ name: 'Conversation', taskID: 'conversation' });
  await store.tasks.create({ name: 'Garden plan', taskID: 'k3vq8m2xpa' });

  await store.records.create({
    kind: 'task_message',
    taskMessage: {
      from: 'k3vq8m2xpa',
      fromName: 'Garden plan',
      hop: 21,
      kind: 'question',
      messageID: 'm7q2x9k4pa',
      text: 'Which bed gets the beans?',
      to: 'conversation',
      woke: false,
    },
    thread: 'conversation',
  });

  await Promise.all(
    Array.from({ length: 120 }, () =>
      store.records.create({ kind: 'task.step_started', thread: 'conversation' }),
    ),
  );

  await store.records.create({
    exchangeNotice: {
      link: { label: 'Open the exchange', messageID: 'm7q2x9k4pa', taskID: 'conversation' },
      text: 'Garden plan and Conversation exchanged 21 messages with no outside cause. New messages between them wait for the next one. Garden plan is waiting on Conversation.',
    },
    kind: 'task.exchange_limited',
    thread: 'k3vq8m2xpa',
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/tasks/k3vq8m2xpa`);

  // The task summary's arrival moves the link down, and a click lands where the link was
  await waitForPage(
    ctx.view,
    `document.body.innerText.includes('Show the whole prompt') && document.body.innerText.includes('Last activity') && document.querySelector('a[href="/#task-message-m7q2x9k4pa"]') !== null`,
    8000,
  );

  await ctx.view.click('a[href="/#task-message-m7q2x9k4pa"]');

  await waitForPage(
    ctx.view,
    "(() => { const box = document.getElementById('task-message-m7q2x9k4pa')?.getBoundingClientRect(); return box !== undefined && box.top >= 0 && box.bottom <= innerHeight; })()",
    8000,
  );
});

test('it shows a reminder with its note and the time it was set for', async () => {
  setupBrowserTimeZone('Europe/Lisbon');

  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.records.create({
    kind: 'trigger.fired',
    reminder: {
      name: 'Dentist',
      note: 'Call the dentist about the crown.',
      lateBySeconds: 7500,
      scheduledFor: '2027-03-09T03:00:00.000Z',
    },
    thread: 'conversation',
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/`);

  await waitFor(
    async () => {
      const text: unknown = await ctx.view.evaluate('document.body.innerText');

      expect(text).toInclude('Reminder: Call the dentist about the crown.');
      expect(text).toInclude('(2 hours 5 minutes late)');
      expect(text).toMatch(/Set for(?=.*Tue)(?=.*Mar)(?=.*\b9\b)(?=.*\b0?3:00)/u);
    },
    { timeout: 10_000 },
  );
});

test('it shows the notice of a skill that a rule applied, with its name, its version and the rule', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.records.create({ kind: 'owner_message', message: { text: 'Save that as a skill.' } });

  await store.records.create({
    kind: 'skills.write_applied',
    skillNotice: {
      name: 'kite-forecast',
      skillHash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      isNew: true,
      ruleID: 'allow-skill-writes',
    },
    thread: 'conversation',
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/`);

  await waitFor(
    async () => {
      const text: unknown = await ctx.view.evaluate('document.body.innerText');

      expect(text).toInclude(
        'nixie saved the new skill kite-forecast, version a1b2c3d4e5f6, under your rule allow-skill-writes.',
      );
    },
    { timeout: 10_000 },
  );
});

test('it shows the notice of an added definition word for word, with an Undo that calls definitions.undo', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.records.create({
    kind: 'definition.changed',
    definitionNotice: buildMockDefinitionNotice(),
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/`);

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('Scheduled: Water the tomatoes, every Friday at 08:00 (next: Fri 12 Mar).')",
    10_000,
  );

  await ctx.view.click('button[name="undo-definition"]');

  await waitFor(
    () => {
      const undone = store.records
        .all()
        .filter((record) => record.definitionNotice?.operation === 'undo');

      expect(undone).toHaveLength(1);
    },
    { timeout: 10_000 },
  );
});

test('it shows a superseded definition notice with no Undo', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.records.create({
    kind: 'definition.changed',
    definitionNotice: buildMockDefinitionNotice({ state: 'superseded', next: null }),
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/`);

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('Scheduled: Water the tomatoes, every Friday at 08:00 (superseded).')",
    10_000,
  );

  const buttons: unknown = await ctx.view.evaluate(
    'document.querySelectorAll(\'button[name="undo-definition"]\').length',
  );

  expect(buttons).toBe(0);
});

test('it shows the REPLACED sentence with the short ID of the head when the Undo is refused', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  await store.records.create({
    kind: 'definition.changed',
    definitionNotice: buildMockDefinitionNotice(),
  });

  // Another client made this change, on a thread this page does not read, so the page still shows
  // the first notice as in force
  await store.records.create({
    kind: 'definition.changed',
    thread: 'another-client',
    definitionNotice: buildMockDefinitionNotice({
      operation: 'change',
      shortID: 'w5n1c8d3ra',
      changeID: 'c-2',
    }),
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await ctx.view.navigate(`${ctx.appURL}/`);

  await waitForPage(
    ctx.view,
    'document.querySelector(\'button[name="undo-definition"]\') !== null',
    10_000,
  );

  await ctx.view.click('button[name="undo-definition"]');

  await waitForPage(
    ctx.view,
    "document.body.innerText.includes('Change w5n1c8d3ra replaced this one. Undo that change instead.')",
    10_000,
  );
});

test('it shows a card from its records when the model reply claims the action is done, then Approved after the answer', async () => {
  const ctx = await setupTest();
  const session = await store.sessions.create({});

  const row = await store.approvalRows.create({
    approveLabel: 'Run mail.send to harbour@example.org',
    sentence: 'Send the tide table to harbour@example.org.',
  });

  await store.records.create({ kind: 'owner_message', message: { text: 'Send the tide table.' } });

  await store.records.create({
    kind: 'policy.action_proposed',
    proposal: { proposalID: row.proposalID, shortID: row.shortID },
  });

  await store.records.create({
    kind: 'model.reply',
    message: { text: 'I sent the tide table to harbour@example.org.' },
  });

  await setupSignedInBrowser(ctx.view, { appURL: ctx.appURL, token: session.token });

  await waitFor(
    async () => {
      const text: unknown = await ctx.view.evaluate(
        "document.querySelector('[aria-label=\"Routine proposal\"] button[name=approve]')?.innerText ?? ''",
      );

      expect(text).toBe('Run mail.send to harbour@example.org');
    },
    { timeout: 10_000 },
  );

  const page: unknown = await ctx.view.evaluate('document.body.innerText');

  expect(page).toInclude('I sent the tide table to harbour@example.org.');

  // The thread keeps its bottom in view while the card settles, so a click at the button's
  // measured point can land on the row beside it.
  await ctx.view.evaluate(
    'document.querySelector(\'[aria-label="Routine proposal"] button[name=approve]\').click()',
  );

  await waitFor(
    async () => {
      const card: unknown = await ctx.view.evaluate(
        "document.querySelector('[aria-label=\"Routine proposal\"]')?.innerText ?? ''",
      );

      expect(card).toInclude('Approved');
    },
    { timeout: 10_000 },
  );

  expect(
    store.approvalRows.findFirst((query) => query.where({ proposalID: row.proposalID }))?.state,
  ).toBe('approved');
});
