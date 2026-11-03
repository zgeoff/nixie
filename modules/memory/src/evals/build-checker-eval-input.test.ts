import { expect, test } from 'bun:test';
import { buildCheckerEvalInput } from './build-checker-eval-input';

test('it gives when the message was sent, marks the quote as evidence and each pasted span, then gives the candidate memory', () => {
  expect(
    buildCheckerEvalInput(
      {
        id: 'sister',
        message: {
          text: 'from my sister: We moved to Leeds.',
          spans: [
            { start: 0, end: 16, source: 'typed' },
            { start: 16, end: 34, source: 'pasted' },
          ],
          sentAt: '2026-10-19T08:00:00Z',
          timeZone: 'Europe/London',
        },
        pairs: [],
      },
      {
        asserted: false,
        bucket: 'pasted fact',
        memory: "The owner's sister lives in Leeds.",
        quote: 'from my sister',
      },
      null,
    ),
  ).toBe(
    '<sent>Mon 19 Oct 2026, 09:00, Europe/London (UTC+01:00)</sent>\n\n' +
      '<owner_message>\n«evidence»from my sister«/evidence»: «pasted»We moved to Leeds.«/pasted»\n</owner_message>\n\n' +
      "<candidate_memory>\nThe owner's sister lives in Leeds.\n</candidate_memory>",
  );
});

test('it gives the end time of a pair in the zone the message was sent from', () => {
  expect(
    buildCheckerEvalInput(
      {
        id: 'lisbon',
        message: {
          text: "I'm in Lisbon this week",
          spans: [{ start: 0, end: 23, source: 'typed' }],
          sentAt: '2026-10-19T08:00:00Z',
          timeZone: 'Europe/Lisbon',
        },
        pairs: [],
      },
      {
        asserted: true,
        bucket: 'matching time limit',
        memory: 'The owner is in Lisbon this week.',
        quote: "I'm in Lisbon this week",
        until: '2026-10-25T23:59:59+00:00',
      },
      null,
    ),
  ).toBe(
    '<sent>Mon 19 Oct 2026, 09:00, Europe/Lisbon (UTC+01:00)</sent>\n\n' +
      "<owner_message>\n«evidence»I'm in Lisbon this week«/evidence»\n</owner_message>\n\n" +
      '<candidate_memory>\nThe owner is in Lisbon this week.\n</candidate_memory>\n\n' +
      '<end_time>Sun 25 Oct 2026, 23:59, Europe/Lisbon (UTC+00:00)</end_time>',
  );
});

test('it marks the original words of a quote that matched with its whitespace collapsed', () => {
  expect(
    buildCheckerEvalInput(
      {
        id: 'vegetarian',
        message: {
          text: 'I am  vegetarian. Since May.',
          spans: [{ start: 0, end: 28, source: 'typed' }],
          sentAt: '2026-10-19T08:00:00Z',
          timeZone: 'Europe/London',
        },
        pairs: [],
      },
      {
        asserted: true,
        bucket: 'plain statement',
        memory: 'The owner is vegetarian.',
        quote: 'I am vegetarian.',
      },
      null,
    ),
  ).toBe(
    '<sent>Mon 19 Oct 2026, 09:00, Europe/London (UTC+01:00)</sent>\n\n' +
      '<owner_message>\n«evidence»I am  vegetarian.«/evidence» Since May.\n</owner_message>\n\n' +
      '<candidate_memory>\nThe owner is vegetarian.\n</candidate_memory>',
  );
});

test('it names the owner in the candidate memory wherever the corpus says the owner', () => {
  expect(
    buildCheckerEvalInput(
      {
        id: 'plumber',
        message: {
          text: 'The plumber charged me double, and my landlord owner-occupies upstairs.',
          spans: [{ start: 0, end: 71, source: 'typed' }],
          sentAt: '2026-10-19T08:00:00Z',
          timeZone: 'Europe/London',
        },
        pairs: [],
      },
      {
        asserted: true,
        bucket: 'plain statement',
        memory:
          "The plumber charged the owner double, and the owner's landlord owner-occupies upstairs.",
        quote: 'The plumber charged me double',
      },
      'Sam',
    ),
  ).toBe(
    '<sent>Mon 19 Oct 2026, 09:00, Europe/London (UTC+01:00)</sent>\n\n' +
      '<owner_message>\n«evidence»The plumber charged me double«/evidence», and my landlord owner-occupies upstairs.\n</owner_message>\n\n' +
      "<candidate_memory>\nThe plumber charged Sam double, and Sam's landlord owner-occupies upstairs.\n</candidate_memory>",
  );
});

test('it refuses a pair whose quote the gate would not find in typed text', () => {
  expect(() =>
    buildCheckerEvalInput(
      {
        id: 'sister',
        message: {
          text: 'from my sister: We moved to Leeds.',
          spans: [
            { start: 0, end: 16, source: 'typed' },
            { start: 16, end: 34, source: 'pasted' },
          ],
          sentAt: '2026-10-19T08:00:00Z',
          timeZone: 'Europe/London',
        },
        pairs: [],
      },
      {
        asserted: false,
        bucket: 'pasted fact',
        memory: "The owner's sister lives in Leeds.",
        quote: 'We moved to Leeds',
      },
      null,
    ),
  ).toThrowWithMessage(Error, /sister pair fails the quote check: not_typed/u);
});
