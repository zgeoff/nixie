import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webFetchConfigSchema } from '@heynixie/connectors';
import { mailConfigSchema } from '@heynixie/mail';
import { wakeRulesConfigSchema } from '@heynixie/triggers';
import { createServerMail } from './create-server-mail';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-server-mail-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return {
    options: {
      config: {
        mail: mailConfigSchema.parse({ address: 'assistant@nixie.example.org' }),
        wake_rules: wakeRulesConfigSchema.parse({}),
        web_fetch: webFetchConfigSchema.parse({}),
      },
      now: () => 1000,
      dataDir,
    },
  };
}

test('it builds no mailbox for a deployment that sets no mail section', async () => {
  const ctx = await setupTest();

  const mail = createServerMail({
    ...ctx.options,
    config: { ...ctx.options.config, mail: undefined },
  });

  expect(mail).toBeNull();
});

test('it serves the mailbox from a host in memory in a test build', async () => {
  const ctx = await setupTest();

  const mail = createServerMail(ctx.options);

  const cursor = await mail?.host.begin();

  mail?.memory?.deliver({ from: 'a@x.example.org', subject: 'Hi', text: 'Hi.' });
  const changes = cursor === undefined ? null : await mail?.host.readChanges(cursor);

  expect(mail?.settings).toStrictEqual({
    address: 'assistant@nixie.example.org',
    hostPollIntervalMs: 30_000,
    wake: { window: 900_000, reply_expiry: 604_800_000 },
    linkPathChars: 24,
  });

  expect(changes).toMatchObject({ kind: 'changes', mails: [{ receivedAt: 1000 }] });
});

test('it keeps the mail of the host in the data folder across a restart', async () => {
  const ctx = await setupTest();

  const first = createServerMail(ctx.options);

  const cursor = await first?.host.begin();

  first?.memory?.deliver({ from: 'a@x.example.org', subject: 'Hi', text: 'Hi.' });
  const restarted = createServerMail(ctx.options);
  const changes = cursor === undefined ? null : await restarted?.host.readChanges(cursor);

  expect(changes).toMatchObject({ kind: 'changes', mails: [{ receivedAt: 1000 }] });
});
