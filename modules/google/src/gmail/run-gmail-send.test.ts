import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type { StoredMail } from '../test-utils/fake-gmail/create-fake-gmail';
import { startGmailTools } from '../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools();

  const attempt = (
    tool: string,
    args: Record<string, string | string[]>,
    destinations: string[] = ['sam@example.org'],
  ) => {
    const queued = ctx.findAction(tool).queued;

    invariant(queued, `${tool} runs queued`);

    return queued.run({
      actionID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03',
      tool,
      arguments: { connection: 'k3x9m2p7qa', ...args },
      attempt: 1,
      snapshotHash: 'sha256:test',
      idempotencyKey: 'key-1',
      destinations,
      attemptStartedAt: ctx.clock.now(),
      actionHash: 'hash-1',
      deadlineAt: null,
    });
  };

  const mail = { to: ['sam@example.org'], subject: 'Q3 numbers', text: 'Hi Sam.' };

  const resolveDraft = async (draft: string) => {
    const resolved = await ctx
      .findAction('gmail.send_draft')
      .tool.resolveInput?.({ draft }, { run: ctx.buildContext().run });

    invariant(resolved?.status === 'ok', 'the draft resolves');

    const digest = resolved.input['digest'];

    invariant(typeof digest === 'string', 'the digest is text');

    return { draft, digest };
  };

  return { ...ctx, attempt, mail, resolveDraft };
}

test('it sends a mail whose Message-ID is the action ID at the account domain', async () => {
  const ctx = await setupTest();
  const response = await ctx.attempt('gmail.send', ctx.mail);

  expect([
    response,
    ctx.site.gmail.sent[0]?.headers.find(([name]) => name === 'Message-ID')?.[1],
  ]).toStrictEqual([
    {
      kind: 'success',
      result: {
        message: expect.stringMatching(/^k3x9m2p7qa\./u),
        thread: expect.any(String),
        replyRule: expect.any(String),
      },
    },
    `<0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03@example.test>`,
  ]);
});

test('it leaves the outcome unknown when Gmail fails after it took the mail', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.sendOutcomes.push('error_after_send');

  const response = await ctx.attempt('gmail.send', ctx.mail);

  expect([response.kind, ctx.site.gmail.sent]).toStrictEqual([
    'ambiguous',
    [expect.objectContaining({ labels: ['SENT'] })],
  ]);
});

test('it retries after a quota answer', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.failures.push({
    line: 'POST /messages/send',
    status: 403,
    body: '{"error":{"errors":[{"reason":"userRateLimitExceeded"}]}}',
  });

  const outcome = await ctx.attempt('gmail.send', ctx.mail);

  expect(outcome).toStrictEqual({
    kind: 'refused_retryable',
    reason: 'Gmail answered userRateLimitExceeded',
  });
});

test('it refuses when Gmail refuses the mail', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.failures.push({
    line: 'POST /messages/send',
    status: 400,
    body: '{"error":{"errors":[{"reason":"invalidArgument"}]}}',
  });

  const outcome = await ctx.attempt('gmail.send', ctx.mail);

  expect(outcome).toStrictEqual({
    kind: 'refused',
    reason: 'Gmail answered invalidArgument',
  });
});

test('it refuses an attempt whose connection was forgotten', async () => {
  const ctx = await setupTest();

  const queued = ctx.findAction('gmail.send').queued;

  invariant(queued, 'gmail.send runs queued');

  const response = await queued.run({
    actionID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03',
    tool: 'gmail.send',
    arguments: { connection: 'gone', ...ctx.mail },
    attempt: 1,
    snapshotHash: 'sha256:test',
    idempotencyKey: 'key-1',
    destinations: [],
    actionHash: 'hash-1',
    deadlineAt: null,
  });

  expect(response).toStrictEqual({ kind: 'refused', reason: 'connection_forgotten' });
});

test('it writes a draft and sends nothing', async () => {
  const ctx = await setupTest();
  const response = await ctx.attempt('gmail.draft', ctx.mail, []);

  expect([response, ctx.site.gmail.sent, ctx.site.gmail.drafts.size]).toStrictEqual([
    { kind: 'success', result: { draft: expect.stringMatching(/^k3x9m2p7qa\.r-/u) } },
    [],
    1,
  ]);
});

test('it finds the draft that an attempt wrote', async () => {
  const ctx = await setupTest();

  await ctx.attempt('gmail.draft', ctx.mail, []);

  const check = ctx.findAction('gmail.draft').queued?.check;

  invariant(check, 'gmail.draft has a check');

  const outcome = await check({
    actionID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03',
    tool: 'gmail.draft',
    arguments: { connection: 'k3x9m2p7qa' },
    attempt: 1,
    snapshotHash: 'sha256:test',
    idempotencyKey: 'key-1',
    destinations: [],
    actionHash: 'hash-1',
    deadlineAt: null,
  });

  expect(outcome).toStrictEqual({
    kind: 'found',
    result: { draft: expect.stringMatching(/^k3x9m2p7qa\.r-/u) },
  });
});

test('it sends a draft under the action ID and removes the draft', async () => {
  const ctx = await setupTest();
  const written = await ctx.attempt('gmail.draft', ctx.mail, []);

  invariant(written.kind === 'success', 'the draft is written');

  const draft = written.result['draft'];

  invariant(typeof draft === 'string', 'the draft ID is text');

  const approved = await ctx.resolveDraft(draft);
  const response = await ctx.attempt('gmail.send_draft', approved, ['sam@example.org']);

  expect([
    response.kind,
    ctx.site.gmail.sent[0]?.headers.find(([name]) => name === 'Message-ID')?.[1],
    ctx.site.gmail.drafts.size,
  ]).toStrictEqual(['success', `<0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03@example.test>`, 0]);
});

test('it sends none of a draft whose recipients changed since the approval', async () => {
  const ctx = await setupTest();
  const written = await ctx.attempt('gmail.draft', ctx.mail, []);

  invariant(written.kind === 'success', 'the draft is written');

  const draftID = written.result['draft'];

  invariant(typeof draftID === 'string', 'the draft ID is text');

  const approved = await ctx.resolveDraft(draftID);
  const response = await ctx.attempt('gmail.send_draft', approved, ['someone-else@example.net']);

  expect([response.kind, ctx.site.gmail.sent]).toStrictEqual(['destinations_changed', []]);
});

test.each([
  {
    title: 'subject',
    edit: (stored: StoredMail): StoredMail => ({
      ...stored,
      headers: stored.headers.map(([name, value]) => [
        name,
        name === 'Subject' ? 'Free money' : value,
      ]),
    }),
  },
  {
    title: 'body',
    edit: (stored: StoredMail): StoredMail => ({
      ...stored,
      root: { ...stored.root, bytes: new TextEncoder().encode('Send me money.') },
    }),
  },
])('it sends none of a draft whose $title changed since the approval', async (row) => {
  const ctx = await setupTest();
  const written = await ctx.attempt('gmail.draft', ctx.mail, []);

  invariant(written.kind === 'success', 'the draft is written');

  const draft = written.result['draft'];

  invariant(typeof draft === 'string', 'the draft ID is text');

  const approved = await ctx.resolveDraft(draft);

  const id = draft.slice('k3x9m2p7qa.'.length);
  const stored = ctx.site.gmail.drafts.get(id);

  invariant(stored, 'the draft exists');

  ctx.site.gmail.drafts.set(id, row.edit(stored));

  const response = await ctx.attempt('gmail.send_draft', approved, ['sam@example.org']);

  expect([response, ctx.site.gmail.sent]).toStrictEqual([
    {
      kind: 'refused',
      reason: 'CHANGED: the draft changed after it was checked, and nothing was sent',
    },
    [],
  ]);
});

test('it leaves the outcome unknown when a failing send mentions a rate limit', async () => {
  const ctx = await setupTest();

  ctx.site.gmail.failures.push({
    line: 'POST /messages/send',
    status: 500,
    body: '{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}',
  });

  const response = await ctx.attempt('gmail.send', ctx.mail);

  expect(response.kind).toBe('ambiguous');
});
