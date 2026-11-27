import { expect, test } from 'bun:test';
import { findPlace } from './find-place';
import { isPlaceCovered } from './is-place-covered';
import { parsePlace } from './parse-place';
import type { PlaceEntry, PlaceKey } from './types';

test('#isPlaceCovered covers the domain alone without subdomains', () => {
  const key: PlaceKey = { kind: 'site', domain: 'example.org', subdomains: false };

  expect([
    isPlaceCovered(key, {
      parsed: parsePlace('https://example.org/x'),
      raw: 'https://example.org/x',
    }),
    isPlaceCovered(key, {
      parsed: parsePlace('https://www.example.org/x'),
      raw: 'https://www.example.org/x',
    }),
    isPlaceCovered(key, {
      parsed: parsePlace('https://api.example.org/x'),
      raw: 'https://api.example.org/x',
    }),
  ]).toStrictEqual([true, true, false]);
});

test('#isPlaceCovered covers every subdomain with subdomains and never a lookalike', () => {
  const key: PlaceKey = { kind: 'site', domain: 'example.org', subdomains: true };

  expect([
    isPlaceCovered(key, { parsed: parsePlace('api.example.org'), raw: 'api.example.org' }),
    isPlaceCovered(key, { parsed: parsePlace('badexample.org'), raw: 'badexample.org' }),
  ]).toStrictEqual([true, false]);
});

test('#isPlaceCovered never lets a site entry cover an address at its domain', () => {
  const key: PlaceKey = { kind: 'site', domain: 'example.org', subdomains: true };

  expect(
    isPlaceCovered(key, { parsed: parsePlace('sam@example.org'), raw: 'sam@example.org' }),
  ).toBe(false);
});

test('#isPlaceCovered lets a mail domain cover each address at it', () => {
  const key: PlaceKey = { kind: 'mail_domain', domain: 'example.org', subdomains: false };

  expect([
    isPlaceCovered(key, { parsed: parsePlace('Sam@Example.org'), raw: 'Sam@Example.org' }),
    isPlaceCovered(key, { parsed: parsePlace('sam@api.example.org'), raw: 'sam@api.example.org' }),
    isPlaceCovered(key, { parsed: parsePlace('example.org'), raw: 'example.org' }),
  ]).toStrictEqual([true, false, false]);
});

test('#isPlaceCovered matches a raw key on the exact string, and a null destination only a raw key', () => {
  const raw: PlaceKey = { kind: 'raw', value: 'owner/skills' };

  expect([
    isPlaceCovered(raw, { parsed: null, raw: 'owner/skills' }),
    isPlaceCovered(raw, { parsed: null, raw: 'owner/Skills' }),
    isPlaceCovered(
      { kind: 'site', domain: 'example.org', subdomains: true },
      { parsed: null, raw: 'example.org' },
    ),
  ]).toStrictEqual([true, false, false]);
});

test('#isPlaceCovered matches a phone number and a handle exactly', () => {
  expect([
    isPlaceCovered(
      { kind: 'phone', e164: '+61420000000' },
      { parsed: parsePlace('+61 420 000 000'), raw: '+61 420 000 000' },
    ),
    isPlaceCovered(
      { kind: 'handle', channel: 'telegram', id: '1' },
      { parsed: parsePlace('telegram:1'), raw: 'telegram:1' },
    ),
    isPlaceCovered(
      { kind: 'handle', channel: 'telegram', id: '1' },
      { parsed: parsePlace('telegram:2'), raw: 'telegram:2' },
    ),
  ]).toStrictEqual([true, true, false]);
});

test('#findPlace lets a blocked entry beat a more specific one', () => {
  const entries: PlaceEntry[] = [
    {
      placeID: '1',
      shortID: 's1',
      key: { kind: 'site', domain: 'example.org', subdomains: true },
      trust: 'blocked',
    },
    {
      placeID: '2',
      shortID: 's2',
      key: { kind: 'site', domain: 'api.example.org', subdomains: false },
      trust: 'act',
    },
  ];

  expect(
    findPlace(entries, { parsed: parsePlace('api.example.org'), raw: 'api.example.org' })?.placeID,
  ).toBe('1');
});

test('#findPlace picks the longer domain, and an exact key over a wildcard', () => {
  const entries: PlaceEntry[] = [
    {
      placeID: '1',
      shortID: 's1',
      key: { kind: 'site', domain: 'example.org', subdomains: true },
      trust: 'read',
    },
    {
      placeID: '2',
      shortID: 's2',
      key: { kind: 'site', domain: 'docs.example.org', subdomains: true },
      trust: 'act',
    },
    {
      placeID: '3',
      shortID: 's3',
      key: { kind: 'site', domain: 'example.org', subdomains: false },
      trust: 'known',
    },
  ];

  expect([
    findPlace(entries, { parsed: parsePlace('a.docs.example.org'), raw: 'a.docs.example.org' })
      ?.placeID,
    findPlace(entries, { parsed: parsePlace('example.org'), raw: 'example.org' })?.placeID,
    findPlace(entries, { parsed: parsePlace('other.org'), raw: 'other.org' }),
  ]).toStrictEqual(['2', '3', null]);
});
