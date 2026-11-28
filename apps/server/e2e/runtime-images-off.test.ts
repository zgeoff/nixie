import { expect, test } from 'bun:test';
import { createTestClient, startE2ENixie } from '@heynixie/server/test-utils';
import { z } from 'zod';

async function setupTest() {
  // a config with no images section, so the images feature is off
  const nixie = await startE2ENixie({});

  const server = nixie.harness.start();

  const api = await createTestClient(server);

  return { nixie, api, server };
}

test('it registers no image tool when the config has no images section', async () => {
  const ctx = await setupTest();
  const reply = await ctx.server.request('readRegisteredTools', null);

  const names = z.array(z.string()).parse(reply);

  expect({
    hasConversationTool: names.includes('task.start'),
    imageTools: names.filter((name) => name.startsWith('image.')),
  }).toStrictEqual({ hasConversationTool: true, imageTools: [] });
});

test('it leaves images out of the features that nixie.read reports', async () => {
  const ctx = await setupTest();
  const read = await ctx.api.client.nixie.read();

  expect(read.features).not.toContain('images');
});

test('it answers a procedure of the images with FEATURE_OFF', async () => {
  const ctx = await setupTest();

  const listed = ctx.api.client.images.list({});

  expect(listed).rejects.toMatchObject({ code: 'FEATURE_OFF', data: { feature: 'images' } });
});

test('it registers the image tools and lists the gallery when the config has an images section, so the checks above can fail', async () => {
  const nixie = await startE2ENixie({
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
  });

  const server = nixie.harness.start();

  const api = await createTestClient(server);
  const reply = await server.request('readRegisteredTools', null);

  const names = z.array(z.string()).parse(reply);

  const listed = await api.client.images.list({});

  expect({
    imageTools: names.filter((name) => name.startsWith('image.')).toSorted(),
    listed,
  }).toStrictEqual({
    imageTools: [
      'image.draw',
      'image.import',
      'image.list',
      'image.name',
      'image.pin',
      'image.read',
      'image.unpin',
    ],
    listed: { images: [], nextCursor: null },
  });
});
