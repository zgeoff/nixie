import { expect, test } from 'bun:test';
import { webFetchConfigSchema } from '@heynixie/connectors';
import { mailConfigSchema } from '@heynixie/mail';
import { wakeRulesConfigSchema } from '@heynixie/triggers';
import { buildServerMail } from './build-server-mail';

function setupTest() {
  return {
    options: {
      config: {
        mail: mailConfigSchema.parse({ address: 'assistant@nixie.example.org' }),
        wake_rules: wakeRulesConfigSchema.parse({}),
        web_fetch: webFetchConfigSchema.parse({}),
      },
      now: () => 1000,
    },
  };
}

test('it builds no mailbox for a deployment that sets no mail section', () => {
  const ctx = setupTest();

  const mail = buildServerMail({
    ...ctx.options,
    config: { ...ctx.options.config, mail: undefined },
  });

  expect(mail).toBeNull();
});

test('it serves the mailbox from a host in memory in a test build', async () => {
  const ctx = setupTest();
  const mail = buildServerMail(ctx.options);

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
