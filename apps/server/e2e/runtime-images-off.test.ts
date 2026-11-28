import { expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { createTestClient, sendClientMessage, startE2ENixie } from '@heynixie/server/test-utils';
import invariant from 'tiny-invariant';
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

test('it lists a drawn picture as it was once images are on again after a start with them off', async () => {
  const section = [
    'images:',
    '  default: easel',
    '  profiles:',
    '    easel:',
    '      provider: openai',
    '      model: image-test-1',
    '      credential: deployment:easel',
    '      prices: { 1024x1024: 40000, 1536x1024: 60000, 1024x1536: 60000 }',
  ];

  const nixie = await startE2ENixie({
    isVoiceOff: true,
    extraConfig: section,
    extraSecrets: ['connector_credentials:', '  easel: easel-test-key'],
  });

  const first = nixie.harness.start();

  const api = await createTestClient(first);

  nixie.model.addReplies(
    { toolUse: { name: 'mcp__nixie__image_draw', input: { prompt: 'a pear on a sill' } } },
    { text: 'Pear-reply-3KD7' },
  );

  await sendClientMessage(api.client, { text: 'Draw a pear on a sill.' }, 'Pear-reply-3KD7', {
    timeoutMs: 30_000,
  });

  const before = await api.client.images.list({});

  await first.sendStopSignal();
  await first.waitForExit();

  const onConfig = await readFile(nixie.configPath, 'utf8');

  const offConfig = onConfig.replace(`${section.join('\n')}\n`, '');

  invariant(offConfig !== onConfig, 'the config holds the images section');

  await writeFile(nixie.configPath, offConfig);

  const second = nixie.harness.start();

  await second.ready;

  await second.sendStopSignal();
  await second.waitForExit();

  await writeFile(nixie.configPath, onConfig);

  const third = nixie.harness.start();

  const again = await createTestClient(third, { token: api.token });
  const after = await again.client.images.list({});

  expect({ drawn: before.images.length, after }).toStrictEqual({ drawn: 1, after: before });
});
