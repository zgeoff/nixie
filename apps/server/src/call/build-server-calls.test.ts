import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildFakeSpeechLayer } from '@heynixie/calls/test-utils';
import type { LogRecord } from '@heynixie/contract';
import { waitForCondition } from '@heynixie/testing';
import { createTestClient } from '../test-utils/create-test-client';
import { startInProcessNixie } from '../test-utils/start-in-process-nixie';

test('it boots with a voice file that is not text and a voice file with no price, and keeps serving', async () => {
  const nixie = await startInProcessNixie({
    extraConfig: ['voice:', '  provider: gpt-live', '  credential: deployment:speech'],
    extraSecrets: ['connector_credentials:', '  speech: speech-key-a'],
    beforeStart: async (files) => {
      const root = join(dirname(files.dataDir), 'definitions');

      await mkdir(join(root, 'voice'));
      await writeFile(join(root, 'nixie.yaml'), 'format: 5\n');
      await writeFile(join(root, 'voice', 'voice.yaml'), 'voice: cedar\n');
      await writeFile(join(root, 'voice', 'lines.yaml'), new Uint8Array([0xff, 0xfe, 0x3a]));
    },
  });

  const api = await createTestClient(nixie);
  const skipped = await nixie.waitForLogEvent('definitions.voice_file_skipped');

  const refused = api.client.calls.start({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(skipped).toMatchObject({ path: 'voice/lines.yaml' });
  expect(refused).rejects.toMatchObject({ code: 'SPEECH_UNAVAILABLE' });
});

test('it answers a call start with VOICE_PRICE_MISSING naming the file, once a speech layer is wired and the price is missing', async () => {
  const nixie = await startInProcessNixie({
    extraConfig: ['voice:', '  provider: gpt-live', '  credential: deployment:speech'],
    extraSecrets: ['connector_credentials:', '  speech: speech-key-a'],
    speech: buildFakeSpeechLayer(),
    beforeStart: async (files) => {
      const root = join(dirname(files.dataDir), 'definitions');

      await mkdir(join(root, 'voice'));
      await writeFile(join(root, 'nixie.yaml'), 'format: 5\n');
      await writeFile(join(root, 'voice', 'voice.yaml'), 'voice: cedar\n');
    },
  });

  const api = await createTestClient(nixie);

  const refused = api.client.calls.start({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({
    code: 'VOICE_PRICE_MISSING',
    message: 'voice/voice.yaml in the definitions has no price_per_minute',
  });
});

async function setupTest() {
  const speech = buildFakeSpeechLayer();

  const nixie = await startInProcessNixie({
    extraConfig: ['voice:', '  provider: gpt-live', '  credential: deployment:speech'],
    extraSecrets: ['connector_credentials:', '  speech: speech-key-a'],
    speech,
    beforeStart: async (files) => {
      const root = join(dirname(files.dataDir), 'definitions');

      await mkdir(join(root, 'voice'));
      await writeFile(join(root, 'nixie.yaml'), 'format: 5\n');
      await writeFile(join(root, 'voice', 'voice.yaml'), 'price_per_minute: 0.05\n');
    },
  });

  const api = await createTestClient(nixie);

  return {
    nixie,
    api,
    speech,
    startLiveCall: async () => {
      const started = await api.client.calls.start({ clientActionID: crypto.randomUUID() });

      await api.client.calls.connect({ callID: started.callID, sdpOffer: 'offer' });

      return started.callID;
    },
    readAnswers: () => speech.calls.filter((call) => call.method === 'answer'),
  };
}

test('it runs a hand-off as one turn of the call thread and sends the reply to the speech layer', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addKindReplies('worker', { text: 'You have two things today.' });

  await ctx.startLiveCall();

  ctx.speech.emit('fake-session-1', { kind: 'hand_off', handOffID: 'h1', request: 'my day' });

  await waitForCondition(() => ctx.readAnswers().length === 1);

  expect(ctx.readAnswers()).toStrictEqual([
    {
      method: 'answer',
      sessionID: 'fake-session-1',
      handOffID: 'h1',
      text: 'You have two things today.',
      final: true,
    },
  ]);
});

test('it shows the next turn the reply up to the point where the user talked over it', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addKindReplies(
    'worker',
    { text: 'You have two things today.' },
    { text: 'Anything else?' },
  );

  await ctx.startLiveCall();

  ctx.speech.emit('fake-session-1', { kind: 'hand_off', handOffID: 'h1', request: 'my day' });

  await waitForCondition(() => ctx.readAnswers().length === 1);

  ctx.speech.emit('fake-session-1', { kind: 'cut', handOffID: 'h1', heardChars: 9 });
  ctx.speech.emit('fake-session-1', { kind: 'hand_off', handOffID: 'h2', request: 'and then' });

  await waitForCondition(() => ctx.readAnswers().length === 2);

  const turns = ctx.nixie.guest.received.filter(
    (received) => received.frame.type === 'turn' && received.owner !== 'conversation',
  );

  const frame = turns.at(-1)?.frame;
  const text = frame?.type === 'turn' ? frame.input.map((message) => message.text).join('\n') : '';

  expect(text).toInclude('They heard: "You have " They did not hear: "two things today."');
});

test('it posts the summary of the call to the conversation as a report when the call ends', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addKindReplies(
    'worker',
    { text: 'You have two things today.' },
    { text: 'The user asked about their day, and I listed two things.' },
  );

  const callID = await ctx.startLiveCall();

  ctx.speech.emit('fake-session-1', { kind: 'hand_off', handOffID: 'h1', request: 'my day' });

  await waitForCondition(() => ctx.readAnswers().length === 1);

  await ctx.api.client.calls.hangUp({ callID, clientActionID: crypto.randomUUID() });

  const read: { records: readonly LogRecord[] } = { records: [] };

  await waitForCondition(async () => {
    const page = await ctx.api.client.conversation.read({ thread: 'conversation' });

    read.records = page.records;

    return (
      read.records.some((record) => record.kind === 'task_message') &&
      JSON.stringify(read.records).includes('listed two things')
    );
  });

  expect(read.records.map((record) => record.kind)).toContain('task_message');
});
