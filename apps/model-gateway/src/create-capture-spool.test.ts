import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import {
  formatSpoolFileName,
  openSpoolFile,
  parseSpoolFileName,
  spoolMissSchema,
} from '@heynixie/wire';
import { createSpoolRecipient } from '@heynixie/wire/test-utils';
import { createCaptureSpool } from './create-capture-spool';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'capture-spool-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const spool = join(directory, 'spool');

  await mkdir(spool);

  const recipient = await createSpoolRecipient();

  const log = mock<Logger>(() => {});
  const captureID = '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3';

  return {
    directory,
    spool,
    recipient,
    log,
    captureID,
    tag: { captureID, sealTo: recipient.sealTo },
    startSpool: (overrides: { maxBytes?: number; maxPending?: number } = {}) =>
      createCaptureSpool({
        config: { spool, maxBytes: 1_000_000, maxPending: 16, ...overrides },
        log,
      }),
  };
}

test('it leaves a .cap file named with the status that opens to the body it was given', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  const body = new TextEncoder().encode('name three harbour birds');

  const handle = spool.begin({
    tag: ctx.tag,
    receivedAt: 1_798_761_600_000,
    route: 'harbour',
    api: 'anthropic-messages',
    endpoint: 'messages',
    body,
  });

  handle.finish(200);

  await spool.settle();

  const names = await readdir(ctx.spool);

  expect(names).toStrictEqual([
    formatSpoolFileName({
      kind: 'cap',
      captureID: ctx.captureID,
      writer: spool.writer,
      counter: 1,
      upstreamStatus: 200,
    }),
  ]);

  const file = await readFile(join(ctx.spool, names[0] ?? ''));
  const opened = await openSpoolFile(new Uint8Array(file), ctx.recipient.privateKey);

  expect(opened?.body).toStrictEqual(body);

  expect(opened?.header).toMatchObject({
    captureID: ctx.captureID,
    writer: spool.writer,
    counter: 1,
    receivedAt: 1_798_761_600_000,
    route: 'harbour',
    api: 'anthropic-messages',
    endpoint: 'messages',
    bytes: body.length,
  });
});

test('it leaves no file when the model API gives no response', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  const handle = spool.begin({
    tag: ctx.tag,
    receivedAt: 1,
    route: 'harbour',
    api: 'anthropic-messages',
    endpoint: 'messages',
    body: new Uint8Array(4),
  });

  handle.drop();

  await spool.settle();

  const answer = await readdir(ctx.spool);

  expect(answer).toStrictEqual([]);
});

test('it removes the .part files of every writer at its start and keeps the .cap and .miss files', async () => {
  const ctx = await setupTest();

  const common = { captureID: ctx.captureID, counter: 1 };
  const part = formatSpoolFileName({ kind: 'part', writer: 'aa', ...common });
  const otherPart = formatSpoolFileName({ kind: 'part', writer: 'bb', ...common });
  const cap = formatSpoolFileName({ kind: 'cap', writer: 'aa', upstreamStatus: 200, ...common });
  const miss = formatSpoolFileName({ kind: 'miss', writer: 'aa', ...common });

  await Promise.all(
    [part, otherPart, cap, miss].map((name) => writeFile(join(ctx.spool, name), 'x')),
  );

  await ctx.startSpool();

  const left = await readdir(ctx.spool);

  expect(left.toSorted()).toStrictEqual([cap, miss].toSorted());
});

test('it leaves a file that is not a spool name alone at its start', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.spool, 'notes.part'), 'x');

  await ctx.startSpool();

  const answer = await readdir(ctx.spool);

  expect(answer).toStrictEqual(['notes.part']);
});

test('it throws at its start when the spool folder is missing', async () => {
  const ctx = await setupTest();

  await rm(ctx.spool, { recursive: true });

  await expect(ctx.startSpool()).rejects.toThrow();
});

test('it throws at its start when the spool is a regular file', async () => {
  const ctx = await setupTest();

  await rm(ctx.spool, { recursive: true });
  await writeFile(ctx.spool, 'x');

  await expect(ctx.startSpool()).rejects.toThrow();
});

test('it answers yes to the ask for its own folder', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();
  const answer = await spool.probeCapture(ctx.spool);

  expect(answer).toBeTrue();
});

test('it answers yes to the ask for its own folder written another way', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();
  const answer = await spool.probeCapture(`${ctx.spool}/../spool/`);

  expect(answer).toBeTrue();
});

test('it answers no to the ask for another folder', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();
  const answer = await spool.probeCapture(ctx.directory);

  expect(answer).toBeFalse();
});

test('it answers no to the ask when the spool was removed after its start', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  await rm(ctx.spool, { recursive: true });

  const answer = await spool.probeCapture(ctx.spool);

  expect(answer).toBeFalse();
});

test('it writes a queue_full miss with its counter when 2 bodies begin in one tick and 1 may wait', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool({ maxPending: 1 });

  const request = {
    tag: ctx.tag,
    receivedAt: 1,
    route: 'harbour',
    api: 'anthropic-messages',
    endpoint: 'messages',
    body: new Uint8Array(4),
  } as const;

  const first = spool.begin(request);

  spool.begin(request);
  first.finish(200);

  await spool.settle();

  const written = await readdir(ctx.spool);

  const names = written.toSorted();

  const missName = formatSpoolFileName({
    kind: 'miss',
    captureID: ctx.captureID,
    writer: spool.writer,
    counter: 2,
  });

  expect(names).toStrictEqual(
    [
      formatSpoolFileName({
        kind: 'cap',
        captureID: ctx.captureID,
        writer: spool.writer,
        counter: 1,
        upstreamStatus: 200,
      }),
      missName,
    ].toSorted(),
  );

  const text = await readFile(join(ctx.spool, missName), 'utf8');

  expect(spoolMissSchema.parse(JSON.parse(text))).toStrictEqual({
    version: 1,
    captureID: ctx.captureID,
    writer: spool.writer,
    counter: 2,
    reason: 'queue_full',
  });
});

test('it writes a spool_full miss when the file would pass the byte limit', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool({ maxBytes: 10 });

  const handle = spool.begin({
    tag: ctx.tag,
    receivedAt: 1,
    route: 'harbour',
    api: 'anthropic-messages',
    endpoint: 'messages',
    body: new Uint8Array(4),
  });

  handle.finish(200);

  await spool.settle();

  const names = await readdir(ctx.spool);

  expect(names.map((name) => parseSpoolFileName(name))).toStrictEqual([
    { kind: 'miss', captureID: ctx.captureID, writer: spool.writer, counter: 1 },
  ]);

  const text = await readFile(join(ctx.spool, names[0] ?? ''), 'utf8');

  expect(spoolMissSchema.parse(JSON.parse(text)).reason).toBe('spool_full');
});

test('it counts the files nixie left in the folder against the byte limit and frees the room when they go', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool({ maxBytes: 1000 });

  const old = formatSpoolFileName({
    kind: 'cap',
    captureID: ctx.captureID,
    writer: 'aa',
    counter: 9,
    upstreamStatus: 200,
  });

  await writeFile(join(ctx.spool, old), new Uint8Array(990));

  const request = {
    tag: ctx.tag,
    receivedAt: 1,
    route: 'harbour',
    api: 'anthropic-messages',
    endpoint: 'messages',
    body: new Uint8Array(4),
  } as const;

  spool.begin(request).finish(200);

  await spool.settle();

  await rm(join(ctx.spool, old));

  spool.begin(request).finish(200);

  await spool.settle();

  const left = await readdir(ctx.spool);

  const kinds = left.map((name) => parseSpoolFileName(name)?.kind).toSorted();

  expect(kinds).toStrictEqual(['cap', 'miss']);
});

test('it writes a spool_write_failed miss when the .part name is taken by a folder', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  await mkdir(
    join(
      ctx.spool,
      formatSpoolFileName({
        kind: 'part',
        captureID: ctx.captureID,
        writer: spool.writer,
        counter: 1,
      }),
    ),
  );

  const handle = spool.begin({
    tag: ctx.tag,
    receivedAt: 1,
    route: 'harbour',
    api: 'anthropic-messages',
    endpoint: 'messages',
    body: new Uint8Array(4),
  });

  handle.finish(200);

  await spool.settle();

  const missName = formatSpoolFileName({
    kind: 'miss',
    captureID: ctx.captureID,
    writer: spool.writer,
    counter: 1,
  });

  const text = await readFile(join(ctx.spool, missName), 'utf8');

  expect(spoolMissSchema.parse(JSON.parse(text)).reason).toBe('spool_write_failed');
});

test('it writes a seal_failed miss when the seal rejects', async () => {
  const ctx = await setupTest();

  const spool = await createCaptureSpool({
    config: { spool: ctx.spool, maxBytes: 1_000_000, maxPending: 16 },
    log: ctx.log,
    seal: () => Promise.reject(new Error('no entropy')),
  });

  const handle = spool.begin({
    tag: ctx.tag,
    receivedAt: 1,
    route: 'harbour',
    api: 'anthropic-messages',
    endpoint: 'messages',
    body: new Uint8Array(4),
  });

  handle.finish(200);

  await spool.settle();

  const names = await readdir(ctx.spool);
  const text = await readFile(join(ctx.spool, names[0] ?? ''), 'utf8');

  expect(names.map((name) => parseSpoolFileName(name)?.kind)).toStrictEqual(['miss']);
  expect(spoolMissSchema.parse(JSON.parse(text)).reason).toBe('seal_failed');
});

test('it runs each capture from 1 and keeps each capture separate', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  const other = '9d1e7c33-2a4b-4f50-8c6d-0b3a5e7f1a24';

  const request = {
    receivedAt: 1,
    route: 'harbour',
    api: 'anthropic-messages',
    endpoint: 'messages',
    body: new Uint8Array(4),
  } as const;

  spool.begin({ ...request, tag: ctx.tag }).finish(200);
  spool.begin({ ...request, tag: ctx.tag }).finish(200);
  spool.begin({ ...request, tag: { captureID: other, sealTo: ctx.recipient.sealTo } }).finish(200);

  await spool.settle();

  const left = await readdir(ctx.spool);

  const counters = left
    .map((name) => parseSpoolFileName(name))
    .map((name) => `${name?.captureID === other ? 'other' : 'first'}:${String(name?.counter)}`)
    .toSorted();

  expect(counters).toStrictEqual(['first:1', 'first:2', 'other:1']);
});

test('it logs the reason and the error code when the miss cannot be written either', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  await rm(ctx.spool, { recursive: true });

  const handle = spool.begin({
    tag: ctx.tag,
    receivedAt: 1,
    route: 'harbour',
    api: 'anthropic-messages',
    endpoint: 'messages',
    body: new Uint8Array(4),
  });

  handle.finish(200);

  await spool.settle();

  expect(ctx.log).toHaveBeenCalledWith(
    'capture.miss_failed',
    { reason: 'spool_write_failed', code: 'ENOENT' },
    'error',
  );
});

test('it logs no byte of a body when a write fails', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  await rm(ctx.spool, { recursive: true });

  spool
    .begin({
      tag: ctx.tag,
      receivedAt: 1,
      route: 'harbour',
      api: 'anthropic-messages',
      endpoint: 'messages',
      body: new TextEncoder().encode('marker-harbour-gull'),
    })
    .finish(200);

  await spool.settle();

  expect(JSON.stringify(ctx.log.mock.calls)).not.toInclude('marker-harbour-gull');
});
