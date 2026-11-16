import { expect, onTestFinished, test } from 'bun:test';
import { waitFor } from '@testing-library/react';
import { store } from '../mocks/store';
import { setupSignedInBrowser } from '../test-utils/setup-signed-in-browser';
import { startBuiltWeb } from '../test-utils/start-built-web';
import { startFrontProxy } from '../test-utils/start-front-proxy';
import { startStubAPI } from '../test-utils/start-stub-api';

async function setupTest() {
  const api = startStubAPI();

  const web = await startBuiltWeb(api.url);

  const app = startFrontProxy({ apiURL: api.url, webURL: web.url });

  const view = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(() => {
    view.close();
  });

  // Bun runs one Chrome for the whole test process, and its views share one cookie jar, so each
  // test starts from an empty one.
  await view.navigate('about:blank');
  await view.cdp('Network.clearBrowserCookies');

  const session = await store.sessions.create({ deviceName: 'laptop' });

  await setupSignedInBrowser(view, { appURL: app.url, token: session.token });

  return {
    appURL: app.url,
    session,
    view,
    findUnknown: (actionID: string) =>
      store.unknownOutcomeRows.findFirst((query) => query.where({ actionID })),
    findRow: (proposalID: string) =>
      store.approvalRows.findFirst((query) => query.where({ proposalID })),
    openDigest: async () => {
      await view.navigate(`${app.url}/memory/proposals`);
    },
    waitForPage: (expression: string) =>
      waitFor(
        async () => {
          const holds: unknown = await view.evaluate(expression);

          expect(holds).toBeTrue();
        },
        { timeout: 8000 },
      ),
    openLine: async (sentence: string) => {
      await waitFor(
        async () => {
          const found: unknown = await view.evaluate(
            `document.querySelector('li[aria-label="${sentence}"] summary') !== null`,
          );

          expect(found).toBeTrue();
        },
        { timeout: 8000 },
      );

      await view.click(`li[aria-label="${sentence}"] summary`);
    },
  };
}

test('it renders each risk class in its own frame and approves only the routine rows from Approve all routine', async () => {
  const ctx = await setupTest();
  const routine = await store.approvalRows.create({ sentence: 'Send the tide table to harbour.' });
  const second = await store.approvalRows.create({ sentence: 'Send the chart to marina.' });

  const always = await store.approvalRows.create({
    riskClass: 'always_ask',
    sentence: 'Pay the berth fee.',
  });

  const lifting = await store.approvalRows.create({
    riskClass: 'lifting',
    ruleSentence: 'Allow payments up to a limit.',
    sentence: 'Lift the pay ask.',
  });

  const memory = await store.approvalRows.create({
    kind: 'memory_write',
    sentence: 'Keeps a rowing boat at the lake',
  });

  await ctx.openDigest();

  await ctx.waitForPage(
    `['Routine proposal', 'Always-ask proposal', 'Lifting proposal'].every((label) => document.querySelector('[aria-label="' + label + '"]') !== null)`,
  );

  const checkboxes: unknown = await ctx.view.evaluate(
    `['Pay the berth fee.', 'Lift the pay ask.', 'Keeps a rowing boat at the lake'].map((sentence) => document.querySelector('li[aria-label="' + sentence + '"] input[type=checkbox]') !== null)`,
  );

  expect(checkboxes).toStrictEqual([false, false, false]);

  await ctx.view.click('button[name="approve-all"]');

  await waitFor(
    () => {
      expect(ctx.findRow(routine.proposalID)?.state).toBe('approved');
    },
    { timeout: 8000 },
  );

  expect(
    [second, always, lifting, memory].map((row) => ctx.findRow(row.proposalID)?.state),
  ).toStrictEqual(['approved', 'pending', 'pending', 'pending']);
});

test('it shows what changed after an answer with a stale hash, and approves only after a fresh tap', async () => {
  const ctx = await setupTest();
  const row = await store.approvalRows.create({ sentence: 'Send the tide table to harbour.' });

  await ctx.openDigest();
  await ctx.openLine('Send the tide table to harbour.');

  await ctx.waitForPage(
    `document.querySelector('button[name="approve"]:not([disabled])') !== null`,
  );

  await store.approvalRows.update(row, {
    data: (draft) => {
      draft.actionHash = 'sha256:changed';
      draft.sentence = 'Send the tide table to marina.';
    },
  });

  await ctx.view.click('button[name="approve"]');

  await ctx.waitForPage(
    `document.querySelector('[aria-label="What changed"]')?.innerText.includes('marina') === true`,
  );

  expect(ctx.findRow(row.proposalID)?.state).toBe('pending');

  await ctx.view.click('button[name="approve"]');

  await waitFor(
    () => {
      expect(ctx.findRow(row.proposalID)?.state).toBe('approved');
    },
    { timeout: 8000 },
  );
});

test('it shows the rule on the card before an always allow, then the notice with Edit and Undo, and Undo removes the rule', async () => {
  const ctx = await setupTest();

  const row = await store.approvalRows.create({
    choices: ['approve', 'always_allow', 'defer', 'decline'],
    rule: {
      destinations: ['harbour@example.org', 'marina@example.org'],
      ruleID: 'allow-tide-mail',
    },
    ruleHash: 'sha256:rule',
    ruleSentence: 'Allow mail.send to harbour@example.org or marina@example.org.',
    sentence: 'Send the tide table to harbour.',
  });

  await ctx.openDigest();
  await ctx.openLine('Send the tide table to harbour.');

  await ctx.waitForPage(
    `document.body.innerText.includes('Always allow adds this rule: Allow mail.send to harbour@example.org or marina@example.org.')`,
  );

  await ctx.view.click('button[name="always_allow"]');

  await ctx.waitForPage(
    `(document.querySelector('[aria-label="Rule added"]')?.innerText ?? '').includes('Rule added: ') && document.querySelector('button[name="edit-rule"]') !== null && document.querySelector('button[name="undo-rule"]') !== null`,
  );

  expect(ctx.findRow(row.proposalID)?.state).toBe('approved');

  await ctx.view.click('button[name="undo-rule"]');
  await ctx.waitForPage(`document.body.innerText.includes('Rule removed')`);

  expect(store.rules.all()).toHaveLength(0);
});

test('it moves a deferred item to the collapsed Deferred group', async () => {
  const ctx = await setupTest();
  const row = await store.approvalRows.create({ sentence: 'Send the tide table to harbour.' });

  await ctx.openDigest();
  await ctx.openLine('Send the tide table to harbour.');
  await ctx.waitForPage(`document.querySelector('button[name="defer"]') !== null`);
  await ctx.view.click('button[name="defer"]');
  await ctx.waitForPage(`document.querySelector('button[name="defer-default"]') !== null`);
  await ctx.view.click('button[name="defer-default"]');

  await ctx.waitForPage(
    `document.querySelector('details[aria-label="Deferred"] li[aria-label="Send the tide table to harbour."]') !== null`,
  );

  const isOpen: unknown = await ctx.view.evaluate(
    `document.querySelector('details[aria-label="Deferred"]').open`,
  );

  expect([isOpen, ctx.findRow(row.proposalID)?.state]).toStrictEqual([false, 'deferred']);
});

test('it edits a memory proposal before approving it from the digest, and applies the edited text', async () => {
  const ctx = await setupTest();

  const row = await store.approvalRows.create({
    kind: 'memory_write',
    memory: {
      actionHash: 'sha256:memory',
      createdAt: new Date('2026-11-14T01:00:00Z'),
      evidence: null,
      image: null,
      isPinned: false,
      isSensitive: false,
      itemID: 'e8a4d2c6-1f3b-4a7e-9c5d-0b6f2e8a1d47',
      kind: 'fact',
      labels: null,
      lapseAt: new Date('2026-11-20T01:00:00Z'),
      newSubject: null,
      operation: 'remember',
      origin: 'conversation',
      proposalID: 'b1c2d3e4-0000-4000-8000-000000000001',
      quote: null,
      reason: 'no_quote',
      source: 'untrusted',
      sources: [],
      subject: 'owner',
      targetVersion: null,
      text: 'Keeps bes on the roof',
      until: null,
    },
    approveLabel: 'Save to memory',
    sentence: 'Keeps bes on the roof',
  });

  await ctx.openDigest();
  await ctx.openLine('Keeps bes on the roof');
  await ctx.waitForPage(`document.querySelector('button[name="edit-text"]') !== null`);
  await ctx.view.click('button[name="edit-text"]');
  await ctx.waitForPage(`document.querySelector('textarea') !== null`);
  await ctx.view.click('textarea');
  await ctx.view.evaluate(`document.querySelector('textarea').select()`);
  await ctx.view.cdp('Input.insertText', { text: 'Keeps bees on the roof' });
  await ctx.view.click('button[name="approve"]');

  await waitFor(
    () => {
      expect(ctx.findRow(row.proposalID)?.appliedText).toBe('Keeps bees on the roof');
    },
    { timeout: 8000 },
  );
});

test('it collapses an item answered on another session to its state with that device name', async () => {
  const ctx = await setupTest();
  const tablet = await store.sessions.create({ deviceName: 'kitchen tablet' });
  const row = await store.approvalRows.create({ sentence: 'Send the tide table to harbour.' });

  await ctx.openDigest();

  await ctx.waitForPage(
    `document.querySelector('li[aria-label="Send the tide table to harbour."]') !== null`,
  );

  await store.approvalRows.update(row, {
    data: (draft) => {
      draft.answeredBy = tablet.sessionID;
      draft.state = 'approved';
    },
  });

  await ctx.view.evaluate(`window.dispatchEvent(new Event('focus'))`);

  await ctx.waitForPage(
    `document.querySelector('li[aria-label="Send the tide table to harbour."][data-state="approved"]')?.innerText.includes('Approved on kitchen tablet') === true`,
  );
});

test('it lists an unknown outcome before every other group', async () => {
  const ctx = await setupTest();

  await store.approvalRows.create({ riskClass: 'always_ask', sentence: 'Pay the berth fee.' });
  await store.unknownOutcomeRows.create({ sentence: 'Run mail.send to team (send).' });
  await ctx.openDigest();

  await ctx.waitForPage(
    `document.querySelector('[aria-label="Unknown outcomes"]') !== null && document.querySelector('[aria-label="Always asks"]') !== null`,
  );

  const unknownIsFirst: unknown = await ctx.view.evaluate(
    `Boolean(document.querySelector('[aria-label="Unknown outcomes"]').compareDocumentPosition(document.querySelector('[aria-label="Always asks"]')) & Node.DOCUMENT_POSITION_FOLLOWING)`,
  );

  expect(unknownIsFirst).toBeTrue();
});

test.each([
  ['happened', 'happened'],
  ['retry', 'retried'],
  ['drop', 'dropped'],
] as const)('it answers an unknown outcome with %s', async (choice, state) => {
  const ctx = await setupTest();
  const row = await store.unknownOutcomeRows.create({});

  await ctx.openDigest();

  await ctx.waitForPage(
    `document.querySelector('button[name="unknown-${choice}"]:not([disabled])') !== null`,
  );

  await ctx.view.click(`button[name="unknown-${choice}"]`);

  await waitFor(
    () => {
      expect(ctx.findUnknown(row.actionID)?.state).toBe(state);
    },
    { timeout: 8000 },
  );
});

test('it asks for the passkey before it retries an always-ask action, and changes nothing without one', async () => {
  const ctx = await setupTest();
  const row = await store.unknownOutcomeRows.create({ riskClass: 'always_ask' });

  await ctx.openDigest();

  await ctx.waitForPage(
    `document.querySelector('button[name="unknown-retry"]:not([disabled])') !== null`,
  );

  await ctx.view.click('button[name="unknown-retry"]');

  await ctx.waitForPage(
    `document.querySelector('[role="alert"]')?.innerText.includes('passkey') === true`,
  );

  expect(ctx.findUnknown(row.actionID)?.state).toBe('waiting');
});
