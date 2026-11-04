import { Database } from 'bun:sqlite';
import { expect, onTestFinished, test } from 'bun:test';
// @boundaries-ignore a spike imports the code it measures
import { modelTurnEndedCodec } from '../../modules/models/src/model-turn-ended-codec.ts';
import { readTurnUsage } from './read-turn-usage.ts';

// the reader reads nixie's records table, which no seed in this spike writes, so the test writes
// the 4 columns the reader uses
function setupTest() {
  const db = new Database(':memory:');

  onTestFinished(() => {
    db.close();
  });

  db.run('create table records (sequence integer primary key, kind text, thread text, payload text)');

  return {
    db,
    writeRecord: (kind: string, thread: string, payload: object) => {
      db.query('insert into records (kind, thread, payload) values (?, ?, ?)').run(
        kind,
        thread,
        JSON.stringify(payload),
      );
    },
  };
}

test('it sums the 4 token fields of each turn by thread, with a total line last', () => {
  const ctx = setupTest();
  ctx.writeRecord(
    'model.turn_ended',
    'conversation',
    modelTurnEndedCodec.encode({
      model: 'claude-test-1',
      profile: 'chat-direct',
      stopReason: 'end_turn',
      turns: 1,
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 3000,
      cacheWriteTokens: 400,
      pinnedCore: [],
      retrieved: [],
      invalidatedThrough: 0,
      sessionImageBytes: 0,
      sessionImageCount: 0,
    }),
  );
  ctx.writeRecord('model.reply', 'conversation', { text: 'Low tide is at noon.' });
  ctx.writeRecord(
    'model.turn_ended',
    'conversation',
    modelTurnEndedCodec.encode({
      model: 'claude-test-1',
      profile: 'chat-direct',
      stopReason: 'end_turn',
      turns: 1,
      inputTokens: 50,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 1,
      pinnedCore: [],
      retrieved: [],
      invalidatedThrough: 0,
      sessionImageBytes: 0,
      sessionImageCount: 0,
    }),
  );
  ctx.writeRecord(
    'model.turn_ended',
    'tide-note',
    modelTurnEndedCodec.encode({
      model: 'claude-test-1',
      profile: 'chat-direct',
      stopReason: 'end_turn',
      turns: 1,
      inputTokens: 7,
      outputTokens: 8,
      cacheReadTokens: 9,
      cacheWriteTokens: 10,
      pinnedCore: [],
      retrieved: [],
      invalidatedThrough: 0,
      sessionImageBytes: 0,
      sessionImageCount: 0,
    }),
  );

  expect(readTurnUsage(ctx.db)).toStrictEqual([
    { thread: 'conversation', turns: 2, tokens: 3576 },
    { thread: 'tide-note', turns: 1, tokens: 34 },
    { thread: 'all', turns: 3, tokens: 3610 },
  ]);
});

test('it rejects a turn whose payload lacks a token field', () => {
  const ctx = setupTest();
  ctx.writeRecord('model.turn_ended', 'conversation', {
    model: 'claude-test-1',
    profile: 'chat-direct',
    stopReason: 'end_turn',
    turns: 1,
    inputTokens: 1,
    outputTokens: 2,
    cacheReadTokens: 3,
    pinnedCore: [],
    retrieved: [],
    invalidatedThrough: 0,
    sessionImageBytes: 0,
    sessionImageCount: 0,
  });

  expect(() => readTurnUsage(ctx.db)).toThrow(/cacheWriteTokens/u);
});
