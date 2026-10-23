import { expect, test } from 'bun:test';
import { renderCheckerInput } from './render-checker-input';

test('it renders the sent time, the marked message and the candidate memory', () => {
  const input = renderCheckerInput(
    {
      sequence: 12,
      text: "I'm in London this week, staying at the Harbour Inn",
      spans: [
        { start: 0, end: 36, source: 'typed' },
        { start: 36, end: 51, source: 'pasted' },
      ],
      sentAt: Date.parse('2026-10-19T08:14:00Z'),
      timeZone: 'Europe/London',
    },
    { start: 0, end: 23 },
    { kind: 'candidate_memory', text: 'Sam is in London this week.', until: null },
    'UTC',
  );

  expect(input).toMatchInlineSnapshot(`
    "<sent>Mon 19 Oct 2026, 09:14, Europe/London (UTC+01:00)</sent>

    <owner_message>
    «evidence»I'm in London this week«/evidence», staying at «pasted»the Harbour Inn«/pasted»
    </owner_message>

    <candidate_memory>
    Sam is in London this week.
    </candidate_memory>"
  `);
});

test('it renders the same input for the same message and memory', () => {
  const first = renderCheckerInput(
    {
      sequence: 12,
      text: "I'm in London this week",
      spans: [{ start: 0, end: 23, source: 'typed' }],
      sentAt: Date.parse('2026-10-19T08:14:00Z'),
      timeZone: 'Europe/London',
    },
    { start: 0, end: 23 },
    {
      kind: 'candidate_memory',
      text: 'Sam is in London this week.',
      until: Date.parse('2026-10-25T23:59:59Z'),
    },
    'UTC',
  );

  const second = renderCheckerInput(
    {
      sequence: 12,
      text: "I'm in London this week",
      spans: [{ start: 0, end: 23, source: 'typed' }],
      sentAt: Date.parse('2026-10-19T08:14:00Z'),
      timeZone: 'Europe/London',
    },
    { start: 0, end: 23 },
    {
      kind: 'candidate_memory',
      text: 'Sam is in London this week.',
      until: Date.parse('2026-10-25T23:59:59Z'),
    },
    'UTC',
  );

  expect(first).toBe(second);
});

test("it shows a candidate's end time in the zone the message was sent from", () => {
  const input = renderCheckerInput(
    {
      sequence: 12,
      text: "I'm in London this week",
      spans: [{ start: 0, end: 23, source: 'typed' }],
      sentAt: Date.parse('2026-10-19T08:14:00Z'),
      timeZone: 'Europe/London',
    },
    { start: 0, end: 23 },
    {
      kind: 'candidate_memory',
      text: 'Sam is in London this week.',
      until: Date.parse('2026-10-25T23:59:59Z'),
    },
    'Australia/Melbourne',
  );

  expect(input).toStartWith('<sent>Mon 19 Oct 2026, 09:14, Europe/London (UTC+01:00)</sent>');
  expect(input).toEndWith('<end_time>Sun 25 Oct 2026, 23:59, Europe/London (UTC+00:00)</end_time>');
});

test('it shows the sent time in the default zone when the message stored no zone', () => {
  const input = renderCheckerInput(
    {
      sequence: 12,
      text: 'Off work until Friday',
      spans: [{ start: 0, end: 21, source: 'typed' }],
      sentAt: Date.parse('2026-10-19T08:14:00Z'),
      timeZone: null,
    },
    { start: 0, end: 21 },
    {
      kind: 'candidate_memory',
      text: 'Sam is off work until Friday.',
      until: Date.parse('2026-10-23T12:59:59Z'),
    },
    'Australia/Melbourne',
  );

  expect(input).toStartWith('<sent>Mon 19 Oct 2026, 19:14, Australia/Melbourne (UTC+11:00)</sent>');

  expect(input).toEndWith(
    '<end_time>Fri 23 Oct 2026, 23:59, Australia/Melbourne (UTC+11:00)</end_time>',
  );
});
