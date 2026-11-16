import { expect, test } from 'bun:test';
import { renderHeldNote } from './render-held-note';

test('it adds no note to a message that woke its task', () => {
  expect(
    renderHeldNote({
      hold: 'none',
      kind: 'question',
      name: 'Planner',
      messageID: 'k3vq8m2xpa',
      hop: 2,
      ownerName: 'Robin',
    }),
  ).toBeNull();
});

test('it tells the sender a message past the hop limit waits for the next wake', () => {
  expect(
    renderHeldNote({
      hold: 'hop_limit',
      kind: 'chat',
      name: 'Planner',
      messageID: 'k3vq8m2xpa',
      hop: 21,
      ownerName: 'Robin',
    }),
  ).toBe(
    'Delivered to Planner as k3vq8m2xpa. It did not wake them, because this exchange reached 20 messages with no message from Robin, timer or outside event. They will read it at their next wake, with any earlier messages. Sending it again adds to the count and does not deliver it sooner.',
  );
});

test('it names the owner as the owner when the configuration names nobody', () => {
  expect(
    renderHeldNote({
      hold: 'hop_limit',
      kind: 'chat',
      name: 'Planner',
      messageID: 'k3vq8m2xpa',
      hop: 4,
      ownerName: null,
    }),
  ).toInclude('with no message from the owner, timer or outside event');
});

test.each(['progress', 'question', 'request'] as const)(
  'it tells the sender of a %s to an asleep task that it reads the message at its next run',
  (kind) => {
    expect(
      renderHeldNote({
        hold: 'next_run',
        kind,
        name: 'Sweeper',
        messageID: 'k3vq8m2xpa',
        hop: 1,
        ownerName: 'Robin',
      }),
    ).toBe(
      'Sweeper is asleep and reads this at its next run. A reply, if any, arrives as a new message.',
    );
  },
);
