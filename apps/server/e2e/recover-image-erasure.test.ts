import { expect, test } from 'bun:test';
import { createTestClient, sendClientMessage, startE2ENixie } from '@heynixie/server/test-utils';
import invariant from 'tiny-invariant';

async function setupTest() {
  return {
    nixie: await startE2ENixie({
      isVoiceOff: true,
      extraConfig: [
        'images:',
        '  default: easel',
        '  profiles:',
        '    easel:',
        '      provider: openai',
        '      model: image-test-1',
        '      credential: deployment:easel',
        '      prices: { 1024x1024: 40000, 1536x1024: 60000, 1024x1536: 60000 }',
      ],
      extraSecrets: ['connector_credentials:', '  easel: easel-test-key'],
    }),
  };
}

test.each([
  'erasure.begun',
  'erasure.sandboxes_destroyed',
  'erasure.keys_removed',
  'erasure.cleaned',
  'erasure.turn_inputs_removed',
] as const)(
  'it finishes at the next start the image forget that nixie was killed during at %s, and the image reads as forgotten',
  async (point) => {
    const ctx = await setupTest();

    const killed = ctx.nixie.harness.start([{ point, kind: 'erasure' }]);

    const api = await createTestClient(killed);

    ctx.nixie.model.addReplies(
      { toolUse: { name: 'mcp__nixie__image_draw', input: { prompt: 'a pear on a sill' } } },
      { text: 'Pear-reply-3KD7' },
    );

    await sendClientMessage(api.client, { text: 'Draw a pear on a sill.' }, 'Pear-reply-3KD7');

    const gallery = await api.client.images.list({});

    const [drawn] = gallery.images;

    invariant(drawn, 'the turn drew a picture');

    const forgetting = Promise.allSettled([
      api.client.images.forget({ clientActionID: crypto.randomUUID(), image: drawn.image }),
    ]);

    await killed.waitForArrival(point);
    await killed.kill();

    await forgetting;

    const restarted = ctx.nixie.harness.start();

    const again = await createTestClient(restarted, { token: api.token });

    const finished = await ctx.nixie.waitForRecord(
      (record) => record.kind === 'erasure.finished' && record.payload['kind'] === 'image',
    );

    const read = await again.client.images.read({ image: drawn.image });

    await restarted.kill();

    expect(finished.payload['shortID']).toBe(drawn.image);
    expect(read.isForgotten).toBe(true);
  },
);
