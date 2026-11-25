import { expect, test } from 'bun:test';
import { findTicketLogProblem } from './find-ticket-log-problem.ts';

test('it finds no problem in a log that holds a redacted address', () => {
  const log = '{"uri":"/rpc/device/frames/REDACTED"}';

  expect(findTicketLogProblem(log, 'ticketFixture0123456789')).toBeNull();
});

test('it reports a log that holds the ticket', () => {
  const log = '{"uri":"/rpc/device/frames/ticketFixture0123456789"}';

  expect(findTicketLogProblem(log, 'ticketFixture0123456789')).toBe(
    'the proxy log holds a bearer ticket',
  );
});

test('it reports a log with no error line', () => {
  expect(findTicketLogProblem('', 'ticketFixture0123456789')).toBe(
    'the proxy log holds no error line for the requests',
  );
});
