import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadSpeechSet } from './download-speech-set.ts';
import { datasetStore } from './mocks/dataset-store.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'download-speech-set-'));

  onTestFinished(() => rm(dir, { force: true, recursive: true }));

  return { dir };
}

test('it keeps the unique caller turns of 6 or more words, up to the count per page', async () => {
  const ctx = await setupTest();
  const targetDir = join(ctx.dir, 'speech-hvb');
  datasetStore.rows.set('asapp/slue-phase-2', [
    {
      audio: [{ src: 'https://audio.test/agent.wav' }],
      issue_id: 'call-a',
      role: 'agent',
      text: 'thank you for calling the bank how can i help',
      utt_index: 1,
    },
    {
      audio: [{ src: 'https://audio.test/short.wav' }],
      issue_id: 'call-a',
      role: 'caller',
      text: 'yes that is right',
      utt_index: 2,
    },
    {
      audio: [{ src: 'https://audio.test/a3.wav' }],
      issue_id: 'call-a',
      role: 'caller',
      text: 'i would like to order a new card',
      utt_index: 3,
    },
    {
      audio: [{ src: 'https://audio.test/a3-copy.wav' }],
      issue_id: 'call-a',
      role: 'caller',
      text: 'i would like to order a new card',
      utt_index: 3,
    },
    {
      audio: [{ src: 'https://audio.test/b5.wav' }],
      issue_id: 'call-b',
      role: 'caller',
      text: 'can you tell me what my balance is',
      utt_index: 5,
    },
    {
      audio: [{ src: 'https://audio.test/c2.wav' }],
      issue_id: 'call-c',
      role: 'caller',
      text: 'please move fifty dollars into my savings',
      utt_index: 2,
    },
  ]);
  datasetStore.audio.set('https://audio.test/a3.wav', new Uint8Array([1]));
  datasetStore.audio.set('https://audio.test/b5.wav', new Uint8Array([2]));

  const kept = await downloadSpeechSet({
    decode: () => Promise.resolve(new Uint8Array([0, 0, 0, 63])),
    pages: 1,
    perPage: 2,
    set: 'hvb',
    targetDir,
    transport: fetch,
  });

  expect(kept).toBe(2);
  expect((await readdir(targetDir)).toSorted()).toStrictEqual(['0.f32', '0.json', '1.f32', '1.json']);
  expect(await readdir(ctx.dir)).toStrictEqual(['speech-hvb']);
  expect(JSON.parse(await readFile(join(targetDir, '0.json'), 'utf8'))).toStrictEqual({
    id: 'call-a-3',
    text: 'i would like to order a new card',
  });
  expect(JSON.parse(await readFile(join(targetDir, '1.json'), 'utf8'))).toStrictEqual({
    id: 'call-b-5',
    text: 'can you tell me what my balance is',
  });
});

test('it keeps one recording of each spoken command of 4 or more words', async () => {
  const ctx = await setupTest();
  const targetDir = join(ctx.dir, 'speech-slurp');
  datasetStore.rows.set('marcel-gohsen/slurp', [
    { audio: [{ src: 'https://audio.test/s4.wav' }], id: 4, transcript: 'lights off now' },
    { audio: [{ src: 'https://audio.test/s7-near.wav' }], id: 7, transcript: 'set an alarm for six' },
    { audio: [{ src: 'https://audio.test/s7-far.wav' }], id: 7, transcript: 'set an alarm for six' },
    { audio: [{ src: 'https://audio.test/s9.wav' }], id: 9, transcript: 'what is the weather in town' },
  ]);
  datasetStore.audio.set('https://audio.test/s7-near.wav', new Uint8Array([1]));
  datasetStore.audio.set('https://audio.test/s9.wav', new Uint8Array([2]));

  const kept = await downloadSpeechSet({
    decode: () => Promise.resolve(new Uint8Array([0, 0, 0, 63])),
    pages: 1,
    perPage: 5,
    set: 'slurp',
    targetDir,
    transport: fetch,
  });

  expect(kept).toBe(2);
  expect(JSON.parse(await readFile(join(targetDir, '0.json'), 'utf8'))).toStrictEqual({
    id: '7',
    text: 'set an alarm for six',
  });
  expect(JSON.parse(await readFile(join(targetDir, '1.json'), 'utf8'))).toStrictEqual({
    id: '9',
    text: 'what is the weather in town',
  });
});

test('it writes the decoded samples of each kept recording', async () => {
  const ctx = await setupTest();
  const targetDir = join(ctx.dir, 'speech-slurp');
  datasetStore.rows.set('marcel-gohsen/slurp', [
    { audio: [{ src: 'https://audio.test/s9.wav' }], id: 9, transcript: 'what is the weather in town' },
  ]);
  datasetStore.audio.set('https://audio.test/s9.wav', new Uint8Array([2]));

  await downloadSpeechSet({
    decode: () => Promise.resolve(new Uint8Array([0, 0, 0, 63])),
    pages: 1,
    perPage: 5,
    set: 'slurp',
    targetDir,
    transport: fetch,
  });

  expect(new Uint8Array(await readFile(join(targetDir, '0.f32')))).toStrictEqual(new Uint8Array([0, 0, 0, 63]));
});
