import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { z } from 'zod';
import { mockPasskeyCode } from '../mocks/passkey-rows';
import { store } from '../mocks/store';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';
import { waitForPage } from '../test-utils/wait-for-page';

async function setupTest() {
  const authenticatorSchema = z.object({ authenticatorId: z.string() });
  const credentialsSchema = z.object({ credentials: z.array(z.unknown()) });
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);

  const proxy = startFrontProxy({ apiURL: api.url, webURL: web.url });

  // WebAuthn refuses an IP address as the RP ID, so the page opens on localhost
  const appURL = proxy.url.replace('127.0.0.1', 'localhost');

  const view = new Bun.WebView({ backend: 'chrome' });

  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  const session = await store.sessions.create({ deviceName: 'laptop' });

  await setupSignedInBrowser(view, { appURL, token: session.token });

  await view.cdp('WebAuthn.enable');

  const addedRaw = await view.cdp('WebAuthn.addVirtualAuthenticator', {
    options: {
      automaticPresenceSimulation: true,
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      protocol: 'ctap2',
      transport: 'internal',
    },
  });

  const added = authenticatorSchema.parse(addedRaw);

  onTestFinished(async () => {
    await view.cdp('WebAuthn.removeVirtualAuthenticator', {
      authenticatorId: added.authenticatorId,
    });

    await view.cdp('WebAuthn.disable');
  });

  // Bun runs one Chrome for the whole test process, and runs these hooks in the order they were
  // added, so the view closes after its authenticator is gone.
  onTestFinished(() => {
    view.close();
  });

  const waitInView = (expression: string) => waitForPage(view, expression, 8000);

  return {
    view,
    waitForPage: waitInView,
    findRow: (proposalID: string) =>
      store.approvalRows.findFirst((query) => query.where({ proposalID })),
    countCredentials: async () => {
      const raw = await view.cdp('WebAuthn.getCredentials', {
        authenticatorId: added.authenticatorId,
      });

      return credentialsSchema.parse(raw).credentials.length;
    },
    registerPasskey: async () => {
      await view.navigate(`${appURL}/passkeys`);

      // The list's arrival moves the form down, and a click lands where the button was
      await waitInView(
        `document.body.innerText.includes('No passkey is set up yet.') && document.querySelector('form[aria-label="Add a passkey"]') !== null`,
      );

      await view.click('form[aria-label="Add a passkey"] label:nth-of-type(2) input');
      await view.type(mockPasskeyCode);
      await view.click('form[aria-label="Add a passkey"] button[type=submit]');

      await waitInView(`document.querySelector('ul[aria-label="Passkeys"] li') !== null`);
    },
    openLine: async (sentence: string) => {
      await view.navigate(`${appURL}/proposals`);

      await waitInView(`document.querySelector('li[aria-label="${sentence}"] summary') !== null`);

      await view.click(`li[aria-label="${sentence}"] summary`);
    },
  };
}

test('it asks the passkey before it sends the approval of an always-ask row, and sends the assertion with it', async () => {
  const ctx = await setupTest();

  await ctx.registerPasskey();

  const row = await store.approvalRows.create({
    choices: ['approve', 'defer', 'decline'],
    riskClass: 'always_ask',
    sentence: 'Pay the berth fee.',
  });

  await ctx.openLine('Pay the berth fee.');
  await ctx.waitForPage(`document.querySelector('button[name="approve"]') !== null`);
  await ctx.view.click('button[name="approve"]');

  await waitFor(
    () => {
      expect(ctx.findRow(row.proposalID)?.state).toBe('approved');
    },
    { timeout: 8000 },
  );

  const checks = store.passkeyChecks.all();
  const credentialIDs = store.passkeyRows.all().map((passkey) => passkey.credentialID);

  expect([
    checks.map((check) => [check.proposalID, check.choice]),
    checks.map((check) => check.credentialID),
    await ctx.countCredentials(),
  ]).toStrictEqual([[[row.proposalID, 'approve']], credentialIDs, 1]);
});

test('it asks no passkey for a decline', async () => {
  const ctx = await setupTest();

  await ctx.registerPasskey();

  const row = await store.approvalRows.create({
    choices: ['approve', 'defer', 'decline'],
    riskClass: 'always_ask',
    sentence: 'Pay the berth fee.',
  });

  await ctx.openLine('Pay the berth fee.');
  await ctx.waitForPage(`document.querySelector('button[name="decline"]') !== null`);
  await ctx.view.click('button[name="decline"]');

  await ctx.waitForPage(
    `document.querySelector('[aria-label="Decline this proposal"] button') !== null`,
  );

  await ctx.view.click('[aria-label="Decline this proposal"] button');

  await waitFor(
    () => {
      expect(ctx.findRow(row.proposalID)?.state).toBe('declined');
    },
    { timeout: 8000 },
  );

  expect(store.passkeyChecks.all()).toStrictEqual([]);
});

test('it asks no passkey for a defer', async () => {
  const ctx = await setupTest();

  await ctx.registerPasskey();

  const row = await store.approvalRows.create({
    choices: ['approve', 'defer', 'decline'],
    riskClass: 'always_ask',
    sentence: 'Pay the berth fee.',
  });

  await ctx.openLine('Pay the berth fee.');
  await ctx.waitForPage(`document.querySelector('button[name="defer"]') !== null`);
  await ctx.view.click('button[name="defer"]');
  await ctx.waitForPage(`document.querySelector('button[name="defer-default"]') !== null`);
  await ctx.view.click('button[name="defer-default"]');

  await waitFor(
    () => {
      expect(ctx.findRow(row.proposalID)?.state).toBe('deferred');
    },
    { timeout: 8000 },
  );

  expect(store.passkeyChecks.all()).toStrictEqual([]);
});

test('it offers to add a passkey and names the host command when the host has none', async () => {
  const ctx = await setupTest();

  const row = await store.approvalRows.create({
    choices: ['approve', 'defer', 'decline'],
    riskClass: 'always_ask',
    sentence: 'Pay the berth fee.',
  });

  await ctx.openLine('Pay the berth fee.');
  await ctx.waitForPage(`document.querySelector('button[name="approve"]') !== null`);
  await ctx.view.click('button[name="approve"]');

  await ctx.waitForPage(
    `document.body.innerText.includes('No passkey is set up') && document.body.innerText.includes('nixie passkey-code') && document.querySelector('main a[href="/passkeys"]') !== null`,
  );

  expect(ctx.findRow(row.proposalID)?.state).toBe('pending');
});

test('it shows Approve, Edit, Not now and Defer on a proposed rule card', async () => {
  const ctx = await setupTest();

  await store.approvalRows.create({
    cause: 'proposed_rule',
    choices: ['approve', 'defer', 'decline'],
    kind: 'internal_change',
    proposedRule: { outcome: 'allow', tools: ['mail.send'] },
    riskClass: 'always_ask',
    sentence: 'Allow mail.send to kim@example.org.',
    approveLabel: 'Allow this rule',
    thread: null,
  });

  await ctx.openLine('Allow mail.send to kim@example.org.');
  await ctx.waitForPage(`document.querySelector('button[name="approve"]') !== null`);

  const labels = await ctx.view.evaluate(
    `['approve', 'edit-text', 'decline', 'defer'].map((name) => document.querySelector('button[name="' + name + '"]')?.textContent ?? null)`,
  );

  expect(labels).toStrictEqual(['Allow this rule', 'Edit', 'Not now', expect.any(String)]);
});

test('it shows the title, each rule and the end of a mandate on its card', async () => {
  const ctx = await setupTest();

  await store.approvalRows.create({
    cause: 'mandate',
    choices: ['approve', 'defer', 'decline'],
    kind: 'internal_change',
    riskClass: 'always_ask',
    sentence: 'Allow calendar.respond, until 2026-11-14T13:00:00Z.',
    approveLabel: 'Start the mandate',
    fields: {
      title: 'Full authority over my calendar invites',
      ends: '2026-11-14T13:00:00.000Z',
      'rule 1': 'Allow calendar.respond, until 2026-11-14T13:00:00Z.',
    },
    thread: null,
  });

  await ctx.openLine('Allow calendar.respond, until 2026-11-14T13:00:00Z.');
  await ctx.waitForPage(`document.querySelector('button[name="approve"]') !== null`);

  const shown = await ctx.view.evaluate(
    `(() => { const text = document.querySelector('li[aria-label="Allow calendar.respond, until 2026-11-14T13:00:00Z."]').innerText; return ['Full authority over my calendar invites', '2026-11-14T13:00:00.000Z', 'Start the mandate', 'Decline'].map((part) => text.includes(part)); })()`,
  );

  expect(shown).toStrictEqual([true, true, true, true]);
});

test('it shows the marks of a rule sentence as bold and code, in the line and on the card', async () => {
  const ctx = await setupTest();

  await store.approvalRows.create({
    cause: 'mandate',
    choices: ['approve', 'defer', 'decline'],
    kind: 'internal_change',
    riskClass: 'always_ask',
    sentence: '**Allow** `calendar.respond`, until 2026-11-14T13:00:00Z.',
    approveLabel: 'Start the mandate',
    fields: {
      title: 'Full authority over my calendar invites',
      ends: '2026-11-14T13:00:00.000Z',
      'rule 1': '**Allow** `calendar.respond`, until 2026-11-14T13:00:00Z.',
    },
    thread: null,
  });

  await ctx.openLine('Allow calendar.respond, until 2026-11-14T13:00:00Z.');
  await ctx.waitForPage(`document.querySelector('button[name="approve"]') !== null`);

  const shown = await ctx.view.evaluate(
    `(() => { const line = document.querySelector('li[aria-label="Allow calendar.respond, until 2026-11-14T13:00:00Z."]'); return { summary: line.querySelector('summary').innerText, marks: Array.from(line.querySelectorAll('strong, code'), (mark) => mark.tagName + ' ' + mark.textContent), hasStars: line.innerText.includes('**') || line.innerText.includes('\`') }; })()`,
  );

  expect(shown).toStrictEqual({
    summary: 'Allow calendar.respond, until 2026-11-14T13:00:00Z.',
    marks: [
      'STRONG Allow',
      'CODE calendar.respond',
      'STRONG Allow',
      'CODE calendar.respond',
      'STRONG Allow',
      'CODE calendar.respond',
    ],
    hasStars: false,
  });
});

test('it shows what each rule of a mandate will not cover on its card', async () => {
  const ctx = await setupTest();

  await store.approvalRows.create({
    cause: 'mandate',
    choices: ['approve', 'defer', 'decline'],
    kind: 'internal_change',
    riskClass: 'always_ask',
    sentence: 'Allow memory.edit and memory.retire, until 2026-11-14T13:00:00Z.',
    approveLabel: 'Start the mandate',
    fields: {
      title: 'Tidy my memory today',
      ends: '2026-11-14T13:00:00.000Z',
      'rule 1': 'Allow memory.edit and memory.retire, until 2026-11-14T13:00:00Z.',
      'rule 1 will not cover': 'a new fact; a pin; a new self-note',
    },
    thread: null,
  });

  await ctx.openLine('Allow memory.edit and memory.retire, until 2026-11-14T13:00:00Z.');
  await ctx.waitForPage(`document.querySelector('button[name="approve"]') !== null`);

  const shown = await ctx.view.evaluate(
    `(() => { const text = document.querySelector('li[aria-label="Allow memory.edit and memory.retire, until 2026-11-14T13:00:00Z."]').innerText; return ['rule 1 will not cover', 'a new fact; a pin; a new self-note'].map((part) => text.includes(part)); })()`,
  );

  expect(shown).toStrictEqual([true, true]);
});

test('it says Not now for a proposed rule and declines it without asking for a note', async () => {
  const ctx = await setupTest();

  const row = await store.approvalRows.create({
    cause: 'proposed_rule',
    choices: ['approve', 'defer', 'decline'],
    kind: 'internal_change',
    proposedRule: { outcome: 'allow', tools: ['mail.send'] },
    riskClass: 'routine',
    sentence: 'Allow mail.send to sam@example.org.',
    thread: null,
  });

  await ctx.openLine('Allow mail.send to sam@example.org.');
  await ctx.waitForPage(`document.querySelector('button[name="decline"]') !== null`);

  const label = await ctx.view.evaluate(
    `document.querySelector('button[name="decline"]').textContent`,
  );

  await ctx.view.evaluate(`document.querySelector('button[name="decline"]').click()`);

  await waitFor(
    () => {
      expect(ctx.findRow(row.proposalID)?.state).toBe('declined');
    },
    { timeout: 8000 },
  );

  expect(label).toBe('Not now');
});

test('it saves an edited proposed rule as a new proposal and withdraws the old one', async () => {
  const ctx = await setupTest();

  const row = await store.approvalRows.create({
    cause: 'proposed_rule',
    choices: ['approve', 'defer', 'decline'],
    kind: 'internal_change',
    proposedRule: { outcome: 'allow', tools: ['mail.send'] },
    riskClass: 'routine',
    sentence: 'Allow mail.send to sam@example.org.',
    thread: null,
  });

  await ctx.openLine('Allow mail.send to sam@example.org.');
  await ctx.waitForPage(`document.querySelector('button[name="edit-text"]') !== null`);
  await ctx.view.evaluate(`document.querySelector('button[name="edit-text"]').click()`);

  await ctx.waitForPage(
    `document.querySelector('div[aria-label="The proposed rule"] textarea') !== null`,
  );

  await ctx.view.click('div[aria-label="The proposed rule"] textarea');
  await ctx.view.type(',mail.draft');
  await ctx.view.evaluate(`document.querySelector('button[name="save-rule"]').click()`);

  await waitFor(
    () => {
      expect(ctx.findRow(row.proposalID)?.state).toBe('withdrawn');
    },
    { timeout: 8000 },
  );

  const opened = store.approvalRows.all().filter((entry) => entry.state === 'pending');

  expect(opened.map((entry) => entry.proposedRule)).toStrictEqual([
    { outcome: 'allow', tools: ['mail.send', 'mail.draft'] },
  ]);
});
