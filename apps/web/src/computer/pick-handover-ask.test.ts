import { expect, test } from 'bun:test';
import { pickHandoverAsk } from './pick-handover-ask';

test('it opens an ask with the reason of its record', () => {
  const ask = pickHandoverAsk(null, {
    kind: 'computer.handover_asked',
    handover: { reason: 'itch.io asks for a CAPTCHA' },
  });

  expect(ask).toStrictEqual({ reason: 'itch.io asks for a CAPTCHA' });
});

test('it opens an ask with no reason once the reason is forgotten', () => {
  const ask = pickHandoverAsk(null, { kind: 'computer.handover_asked', handover: {} });

  expect(ask).toStrictEqual({ reason: null });
});

test.each(['computer.handover_closed', 'computer.takeover_started'])(
  'it ends the ask at a %s record',
  (kind) => {
    expect(pickHandoverAsk({ reason: 'a bank check' }, { kind })).toBeNull();
  },
);

test('it keeps the ask through a record of another kind', () => {
  const ask = pickHandoverAsk({ reason: 'a bank check' }, { kind: 'model.reply' });

  expect(ask).toStrictEqual({ reason: 'a bank check' });
});
