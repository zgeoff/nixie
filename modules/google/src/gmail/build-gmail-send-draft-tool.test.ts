import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { startGmailTools } from '../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools();

  const sendDraft = ctx.findAction('gmail.send_draft');

  return {
    ...ctx,
    resolve: async (draft: string): Promise<JSONObject> => {
      const resolved = await sendDraft.tool.resolveInput?.(
        { draft },
        { run: ctx.buildContext().run },
      );

      invariant(resolved?.status === 'ok', 'the draft resolves');

      return resolved.input;
    },
    prepare: (input: JSONObject) => sendDraft.tool.prepare?.(input, ctx.buildContext()),
  };
}

test('it prepares the card for the draft whose digest the call carries', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({ from: 'me@example.test', subject: 'Q3', text: 'Hi Sam.' });
  const stored = ctx.site.gmail.messages.get(seeded.id);

  invariant(stored, 'the message exists');

  ctx.site.gmail.drafts.set('r-1', { ...stored, id: 'r-1-m' });

  const input = await ctx.resolve('k3x9m2p7qa.r-1');
  const prepared = await ctx.prepare(input);

  expect(prepared).toMatchObject({ attachments: [expect.anything()] });
});

test('it refuses a card for a draft that changed after its digest was taken', async () => {
  const ctx = await setupTest();

  const seeded = ctx.site.gmail.seed({ from: 'me@example.test', subject: 'Q3', text: 'Hi Sam.' });
  const stored = ctx.site.gmail.messages.get(seeded.id);

  invariant(stored, 'the message exists');

  ctx.site.gmail.drafts.set('r-1', { ...stored, id: 'r-1-m' });

  const input = await ctx.resolve('k3x9m2p7qa.r-1');

  ctx.site.gmail.drafts.set('r-1', {
    ...stored,
    id: 'r-1-m',
    root: { ...stored.root, bytes: new TextEncoder().encode('Send me money.') },
  });

  const prepared = await ctx.prepare(input);

  expect(prepared).toStrictEqual({
    status: 'error',
    message: 'CHANGED: the draft changed while the send was being checked, and nothing was queued',
  });
});
