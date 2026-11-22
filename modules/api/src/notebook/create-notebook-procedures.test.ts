import { expect, mock, onTestFinished, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import type { CleanupSessions } from '@heynixie/memory';
import { defaultGateLimits, defaultOwnerPronouns, startMemoryStore } from '@heynixie/memory';
import { buildNotebookMemory, defaultNotebookSettings, startNotebook } from '@heynixie/notebook';
import { buildNotebookToolCaller } from '@heynixie/notebook/test-utils';
import invariant from 'tiny-invariant';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

interface NoteInput {
  readonly title: string;
  readonly body: string;
  readonly isPrivate?: boolean;
}

async function setupTest() {
  const api = await startTestAPI();

  const memory = await startMemoryStore({
    log: api.context.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    cleanupSessions: () => Promise.resolve(),
    gate: {
      check: () =>
        Promise.resolve({
          verdict: 'unsure',
          reason: 'no checker is wired',
          model: 'no-checker',
          failure: 'error',
        }),
      clock: api.clock,
      defaultZone: 'UTC',
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });

  onTestFinished(() => memory.stop());

  const cleanupSessions = mock<CleanupSessions>(() => Promise.resolve());

  const notebook = await startNotebook({
    log: api.context.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    clock: api.clock,
    settings: defaultNotebookSettings,
    memory: buildNotebookMemory(() => memory),
    cleanupSessions,
  });

  onTestFinished(() => notebook.stop());

  api.setNotebook(notebook);

  const laptop = await createDeviceSession(api.context, 'laptop');

  return {
    ...api,
    notebook,
    cleanupSessions,
    client: buildTestClient(api.url, laptop.token),
    call: buildNotebookToolCaller(() => notebook),
    writeNote: async (input: NoteInput) => {
      const written = await notebook.write({ writer: 'conversation', model: 'model-a' }, input);

      invariant(written.status === 'written');

      return written;
    },
  };
}

test('#notebook.listNotes lists each note, and leaves a private one out unless showPrivate is on', async () => {
  const ctx = await setupTest();
  const open = await ctx.writeNote({ title: 'Why the boiler trips', body: 'After cold nights.' });

  const secret = await ctx.writeNote({
    title: 'A diary',
    body: 'Tried the zine.',
    isPrivate: true,
  });

  const hidden = await ctx.client.notebook.listNotes({});
  const shown = await ctx.client.notebook.listNotes({ showPrivate: true });

  expect(hidden.notes.map((note) => note.note)).toStrictEqual([open.shortID]);

  expect(shown.notes.map((note) => note.note).toSorted()).toStrictEqual(
    [open.shortID, secret.shortID].toSorted(),
  );
});

test('#notebook.readNote reads a note with its body and its history', async () => {
  const ctx = await setupTest();

  const written = await ctx.writeNote({
    title: 'Why the boiler trips',
    body: 'After cold nights.',
  });

  await ctx.notebook.edit({ writer: 'conversation', model: 'model-a' }, written.shortID, {
    append: ' Under 2 degrees.',
  });

  const read = await ctx.client.notebook.readNote({ note: written.shortID });

  expect(read).toStrictEqual({
    note: written.shortID,
    version: 2,
    versionCount: 2,
    title: 'Why the boiler trips',
    tags: [],
    isPrivate: false,
    body: 'After cold nights. Under 2 degrees.',
    links: [],
    backlinks: [],
    history: [
      { version: 2, at: expect.any(Date), writer: 'conversation', model: 'model-a', chars: 35 },
      { version: 1, at: expect.any(Date), writer: 'conversation', model: 'model-a', chars: 18 },
    ],
    historyNext: null,
    readAt: null,
    ownerOpenedAt: null,
  });
});

test("#notebook.readNote answers a private note's ID alone when showPrivate is off", async () => {
  const ctx = await setupTest();

  const secret = await ctx.writeNote({
    title: 'A diary',
    body: 'Tried the zine.',
    isPrivate: true,
  });

  const read = await ctx.client.notebook.readNote({ note: secret.shortID });

  expect(read).toStrictEqual({ note: secret.shortID, isPrivate: true });
});

test('#notebook.readNote leaves a private note body out when showPrivate is on', async () => {
  const ctx = await setupTest();

  const secret = await ctx.writeNote({
    title: 'A diary',
    body: 'Tried the zine.',
    isPrivate: true,
  });

  const read = await ctx.client.notebook.readNote({ note: secret.shortID, showPrivate: true });

  expect(read).toMatchObject({
    note: secret.shortID,
    title: 'A diary',
    isPrivate: true,
    body: null,
  });
});

test('#notebook.readNote refuses an unknown note', async () => {
  const ctx = await setupTest();

  const read = ctx.client.notebook.readNote({ note: 'zzzzzzzzzz' });

  await read.catch(() => {});

  expect(read).rejects.toMatchObject({ code: 'UNKNOWN_NOTE', status: 404 });
});

test('#notebook.readNote leaves the note unread by the assistant', async () => {
  const ctx = await setupTest();

  const written = await ctx.writeNote({
    title: 'Why the boiler trips',
    body: 'After cold nights.',
  });

  await ctx.client.notebook.readNote({ note: written.shortID });

  const reads = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['notebook.note_read'],
  });

  expect(reads).toHaveLength(0);
});

test('#notebook.openPrivate returns the body and the one before it, and appends one record', async () => {
  const ctx = await setupTest();

  const secret = await ctx.writeNote({
    title: 'A diary',
    body: 'Tried the zine.',
    isPrivate: true,
  });

  await ctx.notebook.edit({ writer: 'conversation', model: 'model-a' }, secret.shortID, {
    append: ' Two columns.',
  });

  const opened = await ctx.client.notebook.openPrivate({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    note: secret.shortID,
  });

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['notebook.private_opened'],
  });

  expect(opened).toStrictEqual({
    body: 'Tried the zine. Two columns.',
    previousBody: 'Tried the zine.',
    ownerOpenedAt: expect.any(Date),
  });

  expect(records).toHaveLength(1);
});

test('#notebook.openPrivate moves the mark once for a retry of the same action', async () => {
  const ctx = await setupTest();

  const secret = await ctx.writeNote({
    title: 'A diary',
    body: 'Tried the zine.',
    isPrivate: true,
  });

  await ctx.client.notebook.openPrivate({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    note: secret.shortID,
  });

  await ctx.client.notebook.openPrivate({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    note: secret.shortID,
  });

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['notebook.private_opened'],
  });

  expect(records).toHaveLength(1);
});

test('#notebook.openPrivate refuses a note that is not private, and writes nothing', async () => {
  const ctx = await setupTest();
  const open = await ctx.writeNote({ title: 'Why the boiler trips', body: 'After cold nights.' });

  const opened = ctx.client.notebook.openPrivate({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    note: open.shortID,
  });

  await opened.catch(() => {});

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['notebook.private_opened'],
  });

  expect(opened).rejects.toMatchObject({ code: 'NOT_PRIVATE' });
  expect(records).toHaveLength(0);
});

test('#notebook.openPrivate refuses a client action ID that another change used', async () => {
  const ctx = await setupTest();

  const secret = await ctx.writeNote({
    title: 'A diary',
    body: 'Tried the zine.',
    isPrivate: true,
  });

  const other = await ctx.writeNote({ title: 'Another', body: 'Other.', isPrivate: true });

  await ctx.client.notebook.openPrivate({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    note: secret.shortID,
  });

  const reused = ctx.client.notebook.openPrivate({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    note: other.shortID,
  });

  await reused.catch(() => {});

  expect(reused).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test('#notebook.readCheck does not report a note that only a private note links as an orphan when showPrivate is off', async () => {
  const ctx = await setupTest();
  const open = await ctx.writeNote({ title: 'Open note', body: 'Body.' });
  const secret = await ctx.writeNote({ title: 'Private note', body: 'Body.', isPrivate: true });

  await ctx.call('notebook.link', {
    from: secret.shortID,
    to: { note: open.shortID },
    type: 'cites',
  });

  const hidden = await ctx.client.notebook.readCheck({});
  const shown = await ctx.client.notebook.readCheck({ showPrivate: true });

  expect(hidden).toStrictEqual({
    orphans: [],
    dangling: [],
    repeatedReasons: [],
    orphanCount: 0,
    danglingCount: 0,
    repeatedReasonCount: 0,
  });

  expect(shown.orphanCount).toBe(0);
});

test('#notebook.previewForget gives the version, the title and the counts of a private note', async () => {
  const ctx = await setupTest();

  const secret = await ctx.writeNote({
    title: 'A diary',
    body: 'Tried the zine.',
    isPrivate: true,
  });

  const open = await ctx.writeNote({ title: 'Open', body: 'Body.' });

  await ctx.call('notebook.link', {
    from: open.shortID,
    to: { note: secret.shortID },
    type: 'cites',
  });

  const preview = await ctx.client.notebook.previewForget({ note: secret.shortID });

  expect(preview).toStrictEqual({
    version: 1,
    title: 'A diary',
    versionCount: 1,
    linkCount: 0,
    backlinkCount: 1,
  });
});

test('#notebook.forget forgets the note, runs the session cleanup with its ID and answers the backup state', async () => {
  const ctx = await setupTest();

  const written = await ctx.writeNote({
    title: 'Why the boiler trips',
    body: 'After cold nights.',
  });

  const forgotten = await ctx.client.notebook.forget({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    note: written.shortID,
    version: 1,
  });

  const read = ctx.client.notebook.readNote({ note: written.shortID });

  await read.catch(() => {});

  expect(forgotten).toStrictEqual({ forgottenAt: expect.any(Date), backup: { state: 'pending' } });
  expect(ctx.cleanupSessions).toHaveBeenCalledWith({ noteID: expect.any(String) });
  expect(read).rejects.toMatchObject({ code: 'UNKNOWN_NOTE' });
});

test('#notebook.forget answers a retry with the first forget, and forgets once', async () => {
  const ctx = await setupTest();

  const written = await ctx.writeNote({
    title: 'Why the boiler trips',
    body: 'After cold nights.',
  });

  const input = {
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    note: written.shortID,
    version: 1,
  };

  const first = await ctx.client.notebook.forget(input);
  const retried = await ctx.client.notebook.forget(input);

  const records = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['notebook.note_forgotten'],
  });

  expect(retried).toStrictEqual(first);
  expect(records).toHaveLength(1);
});

test('#notebook.forget refuses a stale version, and leaves the note readable', async () => {
  const ctx = await setupTest();

  const written = await ctx.writeNote({
    title: 'Why the boiler trips',
    body: 'After cold nights.',
  });

  await ctx.notebook.edit({ writer: 'conversation', model: 'model-a' }, written.shortID, {
    append: ' More.',
  });

  const forgotten = ctx.client.notebook.forget({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    note: written.shortID,
    version: 1,
  });

  await forgotten.catch(() => {});

  const read = await ctx.client.notebook.readNote({ note: written.shortID });

  expect(forgotten).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(read).toMatchObject({ version: 2 });
});

test('#notebook.forget refuses an unknown note', async () => {
  const ctx = await setupTest();

  const forgotten = ctx.client.notebook.forget({
    clientActionID: '3b9e2f61-4c7a-4d8e-9f10-5a6b7c8d9e0f',
    note: 'zzzzzzzzzz',
    version: 1,
  });

  await forgotten.catch(() => {});

  expect(forgotten).rejects.toMatchObject({ code: 'UNKNOWN_NOTE' });
});

test('#notebook.listNotes refuses a call from a device with no session', async () => {
  const ctx = await setupTest();

  const client = buildTestClient(ctx.url, 'not-a-token');
  const listed = client.notebook.listNotes({});

  await listed.catch(() => {});

  expect(listed).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#conversation.previewForget lists the active notes that link to the record, and leaves a private title out', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the boiler gave out on the coldest night' },
    },
  ]);

  invariant(message);

  const open = await ctx.writeNote({ title: 'Why the boiler trips', body: 'After cold nights.' });

  const secret = await ctx.writeNote({
    title: 'A diary',
    body: 'Tried the zine.',
    isPrivate: true,
  });

  const event = { event: String(message.sequence) };

  await ctx.call('notebook.link', { from: open.shortID, to: event, type: 'cites' });
  await ctx.call('notebook.link', { from: secret.shortID, to: event, type: 'cites' });

  const preview = await ctx.client.conversation.previewForget({
    thread: 'conversation',
    sequence: message.sequence,
  });

  expect(preview.notes).toStrictEqual([
    { note: open.shortID, title: 'Why the boiler trips' },
    { note: secret.shortID },
  ]);
});
