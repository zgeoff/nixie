import { expect, test } from 'bun:test';
import { trustSite } from './trust-site';

test('it asks the server to trust the site at read, and returns the short ID of the entry', async () => {
  const asked: unknown[] = [];

  const place = await trustSite((operation, args) => {
    asked.push([operation, args]);

    return Promise.resolve('k3p9m2x7qa');
  }, 'pages.test');

  expect([place, asked]).toStrictEqual([
    'k3p9m2x7qa',
    [['trustPlace', { domain: 'pages.test', trust: 'read' }]],
  ]);
});

test('it fails when the server returns no short ID', () => {
  expect(trustSite(() => Promise.resolve(''), 'pages.test')).rejects.toThrow();
});
