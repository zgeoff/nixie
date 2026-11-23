import { expect, test } from 'bun:test';
import { pickHandoverAsk } from './pick-handover-ask';

test('it opens an ask with the reason of its record', () => {
  const ask = pickHandoverAsk(null, {
    kind: 'computer.handover_asked',
    sequence: 12,
    handover: { reason: 'itch.io asks for a CAPTCHA' },
  });

  expect(ask).toStrictEqual({ sequence: 12, reason: 'itch.io asks for a CAPTCHA' });
});

test('it opens an ask with no reason once the reason is forgotten', () => {
  const ask = pickHandoverAsk(null, {
    kind: 'computer.handover_asked',
    sequence: 12,
    handover: {},
  });

  expect(ask).toStrictEqual({ sequence: 12, reason: null });
});

test.each(['computer.handover_closed', 'computer.takeover_started'])(
  'it ends the ask at a %s record',
  (kind) => {
    expect(pickHandoverAsk({ sequence: 12, reason: 'a bank check' }, { kind })).toBeNull();
  },
);

test('it keeps the ask through a record of another kind', () => {
  const ask = pickHandoverAsk(
    { sequence: 12, reason: 'a bank check' },
    { kind: 'model.reply', sequence: 13 },
  );

  expect(ask).toStrictEqual({ sequence: 12, reason: 'a bank check' });
});

test('it clears the reason of the displayed ask when a forget removes its record', () => {
  const ask = pickHandoverAsk(
    { sequence: 12, reason: 'a bank check' },
    { kind: 'record.forgotten', sequence: 20, forget: { sequence: 12 } },
  );

  expect(ask).toStrictEqual({ sequence: 12, reason: null });
});

test('it keeps the reason of the displayed ask when a forget removes another record', () => {
  const ask = pickHandoverAsk(
    { sequence: 12, reason: 'a bank check' },
    { kind: 'record.forgotten', sequence: 20, forget: { sequence: 7 } },
  );

  expect(ask).toStrictEqual({ sequence: 12, reason: 'a bank check' });
});
