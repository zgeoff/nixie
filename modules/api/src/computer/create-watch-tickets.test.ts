import { expect, test } from 'bun:test';
import { createFakeClock } from '@zgeoff/testing/clock';
import { createWatchTickets, watchTicketLifetimeMs } from './create-watch-tickets';

function setupTest() {
  const clock = createFakeClock({ startMs: 1000 });

  return { clock, tickets: createWatchTickets(clock) };
}

test('#mint gives 32 random bytes in base64url, different each time', () => {
  const ctx = setupTest();
  const first = ctx.tickets.mint('session-a');
  const second = ctx.tickets.mint('session-a');

  expect([first, second]).toSatisfyAll((ticket: string) => /^[\w-]{43}$/u.test(ticket));
  expect(first).not.toBe(second);
});

test('#redeem gives the session of the ticket once, and null the second time', () => {
  const ctx = setupTest();
  const ticket = ctx.tickets.mint('session-a');
  const first = ctx.tickets.redeem(ticket);
  const second = ctx.tickets.redeem(ticket);

  expect([first, second]).toStrictEqual(['session-a', null]);
});

test('#redeem gives null for a ticket nobody minted', () => {
  const ctx = setupTest();

  expect(ctx.tickets.redeem('AAAA')).toBeNull();
});

test('#redeem accepts a ticket up to 30 seconds old and no later', () => {
  const ctx = setupTest();
  const onTime = ctx.tickets.mint('session-a');
  const late = ctx.tickets.mint('session-a');

  ctx.clock.advance(watchTicketLifetimeMs);

  const accepted = ctx.tickets.redeem(onTime);

  ctx.clock.advance(1);

  const refused = ctx.tickets.redeem(late);

  expect([accepted, refused]).toStrictEqual(['session-a', null]);
});
