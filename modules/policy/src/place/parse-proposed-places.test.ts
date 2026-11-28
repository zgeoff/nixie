import { expect, test } from 'bun:test';
import { parseProposedPlaces } from './parse-proposed-places';

interface RefusedCase {
  readonly title: string;
  readonly place: string;
  readonly trust: 'read' | 'act';
}

test('#parseProposedPlaces reads each place in words with its level and reason', () => {
  const parsed = parseProposedPlaces({
    places: [
      { place: 'tickets.example.com', trust: 'act', why: 'You book here every week.' },
      { place: '*.library.example.org', trust: 'read', why: 'Your library splits its catalog.' },
    ],
  });

  expect(parsed).toStrictEqual({
    status: 'ok',
    places: [
      {
        key: { kind: 'site', domain: 'tickets.example.com', subdomains: false },
        trust: 'act',
        why: 'You book here every week.',
        words: 'tickets.example.com',
      },
      {
        key: { kind: 'site', domain: 'library.example.org', subdomains: true },
        trust: 'read',
        why: 'Your library splits its catalog.',
        words: 'library.example.org and every subdomain',
      },
    ],
  });
});

test.each<RefusedCase>([
  { title: 'a key on a whole public suffix', place: '*.github.io', trust: 'read' },
  { title: 'text that is no place', place: 'not a place', trust: 'read' },
  { title: 'a mail domain at act', place: '@example.org', trust: 'act' },
])('#parseProposedPlaces refuses $title', (row) => {
  const parsed = parseProposedPlaces({
    places: [{ place: row.place, trust: row.trust, why: 'A reason.' }],
  });

  expect(parsed.status).toBe('refused');
});

test('#parseProposedPlaces refuses a list that holds no place', () => {
  expect(parseProposedPlaces({ places: [] })).toStrictEqual({
    status: 'refused',
    message: 'propose at least one place',
  });
});
