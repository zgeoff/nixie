import { expect, test } from 'bun:test';
import { collectUnvoidedReplies } from './collect-unvoided-replies';

test('it leaves out a reply that a void names', () => {
  const records = [
    { kind: 'model.reply', sequence: 4, payload: {} },
    { kind: 'model.reply', sequence: 5, payload: {} },
    { kind: 'model.reply_voided', sequence: 6, payload: { replySequence: 4 } },
    { kind: 'owner_message', sequence: 7, payload: {} },
  ];

  expect(collectUnvoidedReplies(records)).toStrictEqual([
    { kind: 'model.reply', sequence: 5, payload: {} },
  ]);
});
