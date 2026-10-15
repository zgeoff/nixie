import { expect, test } from 'bun:test';
import { store } from './store';
import { writeMockForget } from './write-mock-forget';

test('it drops the text of your message and adds the record that names it', async () => {
  const message = await store.records.create({
    kind: 'owner_message',
    message: { text: 'The shed code is 4417.' },
  });

  const result = await writeMockForget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: message.sequence,
    thread: 'conversation',
  });

  const forgotten = store.records.findFirst((query) => query.where({ kind: 'record.forgotten' }));

  expect(result).toStrictEqual({ status: 'forgotten', forgottenAt: expect.toBeValidDate() });
  expect(forgotten?.forget).toStrictEqual({ sequence: message.sequence });
});

test('it answers a retry with the first time and adds no second record', async () => {
  const message = await store.records.create({ kind: 'owner_message' });

  const first = await writeMockForget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: message.sequence,
    thread: 'conversation',
  });

  const retried = await writeMockForget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: message.sequence,
    thread: 'conversation',
  });

  const records = store.records.findMany((query) => query.where({ kind: 'record.forgotten' }));

  expect(retried).toStrictEqual(first);
  expect(records).toHaveLength(1);
});

test('it answers a second forget of the record under a new ID with the first time', async () => {
  const message = await store.records.create({ kind: 'model.reply' });

  const first = await writeMockForget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: message.sequence,
    thread: 'conversation',
  });

  const second = await writeMockForget({
    clientActionID: '9a3e6c21-4b7d-4f8a-b2c5-1d0e7f9a6b34',
    sequence: message.sequence,
    thread: 'conversation',
  });

  expect(second).toStrictEqual(first);
});

test('it refuses an ID that forgot another record as reused', async () => {
  const first = await store.records.create({ kind: 'owner_message' });
  const second = await store.records.create({ kind: 'model.reply' });

  await writeMockForget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: first.sequence,
    thread: 'conversation',
  });

  const result = await writeMockForget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: second.sequence,
    thread: 'conversation',
  });

  expect(result).toStrictEqual({ status: 'reused' });
});

test('it refuses a retry of the ID that names another thread as reused', async () => {
  const message = await store.records.create({ kind: 'owner_message' });

  await writeMockForget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: message.sequence,
    thread: 'conversation',
  });

  const result = await writeMockForget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: message.sequence,
    thread: 'task-elsewhere',
  });

  expect(result).toStrictEqual({ status: 'reused' });
});

test('it refuses an ID that forgot a record already forgotten when it names another record', async () => {
  const first = await store.records.create({ kind: 'owner_message' });
  const second = await store.records.create({ kind: 'model.reply' });

  await writeMockForget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: first.sequence,
    thread: 'conversation',
  });

  await writeMockForget({
    clientActionID: '9a3e6c21-4b7d-4f8a-b2c5-1d0e7f9a6b34',
    sequence: first.sequence,
    thread: 'conversation',
  });

  const result = await writeMockForget({
    clientActionID: '9a3e6c21-4b7d-4f8a-b2c5-1d0e7f9a6b34',
    sequence: second.sequence,
    thread: 'conversation',
  });

  expect(result).toStrictEqual({ status: 'reused' });
});

test('it finds no record when a new ID names a forgotten record on another thread', async () => {
  const message = await store.records.create({ kind: 'owner_message' });

  await writeMockForget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: message.sequence,
    thread: 'conversation',
  });

  const result = await writeMockForget({
    clientActionID: '9a3e6c21-4b7d-4f8a-b2c5-1d0e7f9a6b34',
    sequence: message.sequence,
    thread: 'task-elsewhere',
  });

  expect(result).toStrictEqual({ status: 'not_found' });
});

test('it finds no record to forget at a sequence that holds no message or reply', async () => {
  const call = await store.records.create({ kind: 'tool_called' });

  const result = await writeMockForget({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    sequence: call.sequence,
    thread: 'conversation',
  });

  expect(result).toStrictEqual({ status: 'not_found' });
});
