import { expect, test } from 'bun:test';
import { createPageTickets } from './create-page-tickets';

test('#createPageTickets gives the same tickets to the same content each time', () => {
  const tickets = createPageTickets();
  const first = tickets.issue('dk4m7q2w9x', 'pond', 'sh1', ['k3x9m2p7qa']);
  const second = tickets.issue('dk4m7q2w9x', 'pond', 'sh1', ['k3x9m2p7qa']);

  expect(second).toStrictEqual(first);
});

test('#createPageTickets ends the tickets of content that new content replaces', () => {
  const tickets = createPageTickets();
  const first = tickets.issue('dk4m7q2w9x', 'pond', 'sh1', ['k3x9m2p7qa']);

  tickets.issue('dk4m7q2w9x', 'pond', 'sh2', []);

  expect([tickets.read(first.frame), tickets.read(first.images[0]?.ticket ?? '')]).toStrictEqual([
    null,
    null,
  ]);
});

test('#createPageTickets names what each ticket opens', () => {
  const tickets = createPageTickets();
  const issued = tickets.issue('dk4m7q2w9x', 'pond', 'sh1', ['k3x9m2p7qa']);

  expect([tickets.read(issued.frame), tickets.read(issued.images[0]?.ticket ?? '')]).toStrictEqual([
    { kind: 'frame', deviceID: 'dk4m7q2w9x', region: 'pond', shown: 'sh1' },
    { kind: 'image', deviceID: 'dk4m7q2w9x', region: 'pond', shown: 'sh1', image: 'k3x9m2p7qa' },
  ]);
});

test('#createPageTickets keeps the tickets of one region apart from another', () => {
  const tickets = createPageTickets();
  const pond = tickets.issue('dk4m7q2w9x', 'pond', 'sh1', []);
  const note = tickets.issue('dk4m7q2w9x', 'note', 'sh2', []);

  expect([note.frame === pond.frame, tickets.read(pond.frame)?.region]).toStrictEqual([
    false,
    'pond',
  ]);
});

test('#createPageTickets reads no ticket that it never issued', () => {
  expect(createPageTickets().read('0e0b4b3e-0000-4000-8000-000000000000')).toBeNull();
});

test('#createPageTickets ends the tickets of a region that was removed, and gives new ones after', () => {
  const tickets = createPageTickets();
  const first = tickets.issue('dk4m7q2w9x', 'pond', 'sh1', ['k3x9m2p7qa']);

  tickets.remove('dk4m7q2w9x', 'pond');

  const again = tickets.issue('dk4m7q2w9x', 'pond', 'sh1', ['k3x9m2p7qa']);

  expect([tickets.read(first.frame), again.frame === first.frame]).toStrictEqual([null, false]);
});
